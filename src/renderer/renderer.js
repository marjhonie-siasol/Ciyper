const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

// DOM Elements
const recordingCloseBtn = document.getElementById('recording-close-btn');
const chatInput = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const listenBtn = document.getElementById('listen-btn');
const messagesList = document.getElementById('messages-list');
const chatContainer = document.getElementById('chat-container');
const statusText = document.getElementById('status-text');
const expandToggleBtn = document.getElementById('expand-toggle-btn');
const chevronIcon = document.getElementById('chevron-icon');
const chatPanel = document.getElementById('chat-panel');
const windowContainer = document.getElementById('widget-container');
const audioWaveGif = document.getElementById('audio-wave-gif');
const resizeHandle = document.getElementById('resize-handle');
const controlBar = document.getElementById('control-bar');
const menuBtn = document.getElementById('menu-btn');
const menuIcon = document.getElementById('menu-icon');
const sessionMenuModal = document.getElementById('session-menu-modal');
const sessionAppVersion = document.getElementById('session-app-version');
const playbackToggleBtn = document.getElementById('playback-toggle-btn');
const playbackToggleIcon = document.getElementById('playback-toggle-icon');
const screenshotBtn = document.getElementById('screenshot-btn');
const screenshotDefaultIcon = document.getElementById('screenshot-default-icon');
const screenshotPreviewThumb = document.getElementById('screenshot-preview-thumb');
const screenshotRemoveOverlay = document.getElementById('screenshot-remove-overlay');
let pendingScreenshot = null;

if (sessionAppVersion && ipcRenderer) {
  ipcRenderer.invoke('get-app-version').then(ver => {
    if (ver) {
      sessionAppVersion.textContent = `Ciyper v${ver}`;
    }
  }).catch(() => {});
}

let GEMINI_API_KEYS = [];
let activeKeyIndex = 0;
let MODEL_NAME = 'openai/gpt-oss-120b';
let activeAbortController = null;

// System prompt & interview conversation state
let systemInstructionText = "";
let candidateName = "a senior software engineer";
let sessionHistory = [];
let latestSourceInfo = null;
let savedSessionMessages = [];
let apiMessages = [];
let clarifyState = {
  clarifyActive: false,
  targetDepth: 0,
  currentRound: 0,
  originalMode: null,
  anchorQuestion: ''
};

const SUPPORTED_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

function getFriendlyModelName(modelVal) {
  return modelVal || 'openai/gpt-oss-120b';
}

function getActiveKeyLabel() {
  const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';
  const keyLabel = currentType === 'primary' ? 'Primary' : currentType === 'backup1' ? 'Backup 1' : 'Backup 2';
  return `<span style="color: #9CA3AF !important; font-weight: 500;">AI Respond (${keyLabel})</span> <span style="color: #FFFFFF !important; font-weight: 500;">${getFriendlyModelName(MODEL_NAME)}</span>`;
}

function rotateApiKey(labelDiv = null) {
  if (activeKeyIndex < GEMINI_API_KEYS.length - 1) {
    activeKeyIndex++;
    const nextType = GEMINI_API_KEYS[activeKeyIndex].type;
    const label = nextType === 'primary' ? 'Primary Key' : nextType === 'backup1' ? 'Backup Key 1' : 'Backup Key 2';
    console.warn(`API key failover triggered. Switching to: ${label}`);
    updateStatus(`Switching to ${label}...`, 'thinking');
    if (labelDiv) {
      labelDiv.innerHTML = getActiveKeyLabel();
    }
    return true;
  }
  return false;
}

function getRagEngine() {
  if (typeof CiyperRAG !== 'undefined' && CiyperRAG && CiyperRAG.getRelevantContext) {
    return CiyperRAG;
  }
  if (typeof window !== 'undefined' && window.CiyperRAG && window.CiyperRAG.getRelevantContext) {
    return window.CiyperRAG;
  }
  if (typeof require === 'function') {
    try {
      return require('./rag.js');
    } catch (e) {
      return null;
    }
  }
  return null;
}

function buildCodingAnswerRules() {
  return `Structure your coding response like a calm, confident engineer walking straight through the Python syntax aloud while typing—natural everyday English, full awareness of what each syntax piece does, and how it solves the problem:

1. Opening strategy (REQUIRED 1 quick spoken sentence BEFORE the code block): Name the plan plainly in one short sentence ("I will ...").
2. Clean, 100%-bug-free fenced code block (Begin strictly with \`\`\`python (or requested language like Go, JS/TS, SQL, Java, C++) and end cleanly with \`\`\`. Match requested signatures/names if given, wrap inside a clean def/class, and output ONLY the solution—zero sample prints or example calls):
   - Put comment 1 directly ABOVE the first outer line at column 0. Call out EVERY meaningful line directly above it, matching each comment's leading spaces exactly to the indented code line below it (zero trailing inline comments). Speak directly about the code syntax without saying "I" or "we" inside code comments.
   - Start strictly the single opening comment at line 1 of the entire code block with "So first,"—any later top-level struct, function, or method uses "Next" or "Then" cleanly without forcing commas onto action verbs like "Check if" or "While".
   - Follow one tight two-part rhythm per comment—open in a few words naming the Python syntax and exact identifier from the line below, then finish in just a few words tying it to the problem ("for ..." / "to ..."), keeping every comment compact and one quick breath. Write math, indexing, and comparisons in plain spoken words (such as "using function max", "plus", "minus", "integer division", "at most", or "exceeds"; match singular "parameter" vs plural "parameters"), keeping operators, math equations, and backticks out of comments:
     - Top line only: "# So first, define a function called <name> with parameter <x> to <goal>" / "# So first, define a class called <Name> for <role>"
     - Later top-level blocks (e.g. multi-struct/func Go): "# Next define struct <Name> for <role>" / "# Then define function <name> with <params> to <goal>"
     - Constructor & methods: "# Next define constructor to set up <fields>" / "# Next define method <method> with parameter <arg> to <task>"
     - Setups: "# Then assign <a> and <b> using <fn1> and <fn2> on <seq>" / "# Create empty list or dict <res> to collect <items>" / "# Set <var> to zero for <role>"
     - Helper definition: "# Define helper <helper> with <val> to check <target>"
     - Loops: "# Now run a for loop over <seq> to process each <item>" / "# Run a while loop while <cond> holds for <goal>"
     - Branches & updates: "# Check if <cond> to handle <case>" / "# Update <var> to ... for <role>" / "# Store <val> in <res> to record <role>"
     - Return statement: "# Return <res> for the final answer" / "# Return <val> early when <case>"
   - Only name a built-in, method, or function if that exact line calls it; use clean tuple assignments, standard frequency helpers like Counter when counting characters or items, compact updates, and one-line boolean/ternary returns; and make loop descriptions match the exact loop operator below.
3. Short footer (below closing \`\`\`): Strictly **2 ultra-brief takeaway bullets** (core idea + edge case in crisp fragments) and **1 short Time / Space bullet**.

VOICE & CORRECTNESS RULES:
- Prioritize 100% correctness before clever tricks: Prefer a clean, simple, rock-solid algorithm unless huge constraints strictly force advanced structures. Mentally trace Example 1 (plus tricky partial overlaps, edge touching, and duplicates) line-by-line on your exact code before outputting—only use a segment tree if top-down with full lazy pushdown for range updates, and never discard still-needed intervals or elements.
- Bug-free concurrency & locks: Standard mutexes (like Go sync.Mutex) are strictly NON-REENTRANT—locking twice on the same goroutine causes an instant deadlock. Extract lock-free private helpers for BOTH reads AND writes, and audit every Lock block so no function called inside locks again. Release locks before slow external fetches and clean up state via defer; for lazy TTL expiration on Get, check only the requested key directly in O(1).
- Human honesty: Never call imaginary helpers or invent external libraries not written in your solution or asked for.
- Plain text rules: Zero markdown # headers, zero contractions anywhere ("I will", "it is", "we do not", "cannot").`;
}

function buildTechnicalAnswerRules(questionText, contextText, clarifyInfo = null) {
  const ragEngine = getRagEngine();
  const anchorOrQ = (clarifyInfo && clarifyInfo.anchorQuestion) ? clarifyInfo.anchorQuestion : questionText;
  const hypothetical = ragEngine && ragEngine.isHypotheticalScenario
    ? ragEngine.isHypotheticalScenario(anchorOrQ, contextText)
    : false;

  const openerSets = [
    ['"Yeah,"', '"Right,"'],
    ['"Right,"', '"Sure,"'],
    ['"Yeah,"', '"Honestly,"'],
    ['"Sure,"', '"Yeah,"']
  ];
  const bridge2Sets = hypothetical
    ? [
        ['"So"', '"First,"'],
        ['"To handle that,"', '"So"'],
        ['"First,"', '"Basically,"'],
        ['"Basically,"', '"So"']
      ]
    : [
        ['"So"', '"Basically,"'],
        ['"When I dug in,"', '"So"'],
        ['"To fix it,"', '"Basically,"'],
        ['"First,"', '"So"']
      ];
  const bridge3Sets = hypothetical
    ? [
        ['"Then"', '"After that,"'],
        ['"From there,"', '"On top of that,"'],
        ['"After that,"', '"That way,"'],
        ['"To stay safe,"', '"From there,"']
      ]
    : [
        ['"From there,"', '"That way,"'],
        ['"Out of that,"', '"After that,"'],
        ['"Then"', '"Long term,"'],
        ['"After that,"', '"And from that,"']
      ];
  const seed = (questionText || '').length;
  const idx = seed % openerSets.length;
  const b2Idx = seed % bridge2Sets.length;
  const b3Idx = (seed + 1) % bridge3Sets.length;

  const s1Desc = hypothetical
    ? `Open with one very short, natural sentence quickly naming the core challenge or trade-off (if starting with ${openerSets[idx].join(' or ')}, follow it with a comma; never echo their whole prompt back).`
    : `Open with one very short, natural sentence quickly framing the core problem or first symptom (if starting with ${openerSets[idx].join(' or ')}, follow it with a comma; never echo their whole question back).`;

  const s2Desc = hypothetical
    ? `Pick up smoothly after that pause (e.g., ${bridge2Sets[b2Idx].join(' / ')}) and explain the core architecture, split, or handling strategy in conditional first-person ("I would..." or "we would...") using everyday words.`
    : `Pick up smoothly after that pause (e.g., ${bridge2Sets[b2Idx].join(' / ')}) and give the real action, root cause, or architecture move in active first-person ("I" or "we") using everyday words.`;

  const s3Desc = hypothetical
    ? `Continue cleanly after the second pause (e.g., ${bridge3Sets[b3Idx].join(' / ')}) to cover the critical edge case, failure check, or trade-off ("I would also check..."), stopping cleanly there.`
    : `Continue cleanly after the second pause (e.g., ${bridge3Sets[b3Idx].join(' / ')}) to land the follow-up fix, safeguard, trade-off, or real outcome from your files, stopping cleanly there.`;

  const voiceExampleRule = hypothetical
    ? `- STRICT HYPOTHETICAL TENSE ("I would"): This is a scenario or design question, NOT something you already shipped in the past—use "I would split", "I would lock", "we would check". NEVER falsely say "I built" or "we published" as if it happened in the past.
- Technical focus & honesty: Hit every explicit constraint in the prompt clearly without rambling. If an exact number or policy is unstated, keep it realistic or acknowledge it depends on requirements instead of inventing fake metrics.`
    : `- Technical sanity & human honesty: Anchor past stories directly in your files below—never invent contradictory symptoms, fake Redis tables, or made-up threshold numbers that are not in your files. If an exact historical parameter is not stated, acknowledge you do not recall the exact figure offhand or describe the mechanism plainly without bluffing.
- Strict tense match: Use past tense for past roles/incidents ("I traced", "I split", "I kept") and active first-person ("I" or "we"), never passive documentation talk ("the system", "is performed").`;

  let rules = `Keep the entire spoken reply tight, plainspoken, and easy to say aloud in around twenty to twenty-five seconds.

Write THREE crisp spoken sentences separated by blank lines, and STOP after Sentence 3 (no closing small talk):

1. Micro opening lock: ${s1Desc}
2. Main approach or action: ${s2Desc}
3. Edge case, safeguard, or resolution: ${s3Desc}

VOICE & HUMAN RULES:
- Balanced one-breath sentences: Keep EVERY sentence short and easy to say in a single breath (at most two clauses per sentence)—NEVER cram four ideas into a 50-word Sentence 2 or Sentence 3 with chained ", and ... while ..." clauses.
- Crisp metrics & smart selective bolding: Write scale and latency metrics naturally in compact digits (e.g., 15ms, 500ms, 250k/s). Use **bold** ONLY on genuinely high-signal technical mechanisms, hard SLA numbers, or critical trade-off forks when a sentence is dense enough that bolding speeds up scanning. Do NOT force bolding on simple sentences, everyday verbs, or straightforward replies—never bold an entire sentence, and leave simple replies completely plain with zero bolding.
${voiceExampleRule}
- Zero contractions: Always spell out full words ("I would", "I am", "it is", "did not", "do not", "could not", "cannot").
- Zero filler connectors: Never repeat the same connector twice or stack transitions.
- No buzzwords, no bullet points, no # headers. Never mention being an AI.`;

  if (contextText) {
    rules += `\n\n=== YOUR RESUME & EXPERIENCE FILES ===\n${contextText}`;
  }
  if (clarifyInfo && clarifyInfo.justFinishedClarify) {
    const tenseReminder = hypothetical
      ? `Use hypothetical "I would" voice strictly (never claim "I built").`
      : `Match tense strictly to whether the prompt asks about a past role vs hypothetical design.`;
    rules += `\n\nIMPORTANT MULTI-TURN SYNTHESIS RULE: Clarifications are complete. Keep your reply strictly to 3 tight one-breath sentences: tie directly back to Turn 1's core goal, weave in the confirmed constraints concisely without listing every number back word-for-word, and never propose any ruled-out option. ${tenseReminder}`;
  }
  return rules;
}

function buildSystemPrompt(mode, questionText, contextText, clarifyInfo = null) {
  const personaName = (candidateName && candidateName !== 'a senior software engineer')
    ? candidateName
    : 'a senior software engineer';
  const nameNote = ' If the interviewer addresses you by another name, accept it naturally.';

  if (mode === 'SmallTalk') {
    return `You are ${personaName} on a live video call.${nameNote} Reply warmly in one casual spoken sentence. Never use contractions (always spell out full words like "I am", "it is", "doing well").`;
  }

  if (mode === 'FeedbackAck') {
    return `You are ${personaName} in a live technical interview.${nameNote} The interviewer just praised or agreed with your explanation and did not ask a new question.
Reply with ONE short, warm, natural spoken acknowledgment sentence (do NOT repeat or re-explain the technical architecture back to them). Never use contractions (always spell out "I am", "it is", "happy to").`;
  }

  if (mode === 'DynamicTurn1') {
    const isCode = Boolean(clarifyInfo && clarifyInfo.isCoding);
    const explicitCue = Boolean(clarifyInfo && clarifyInfo.explicitClarifyCue);
    const fromAudio = Boolean(clarifyInfo && clarifyInfo.fromAudio);
    const answerBlock = isCode ? buildCodingAnswerRules() : buildTechnicalAnswerRules(questionText, contextText, clarifyInfo);
    const cueHint = explicitCue
      ? `\n- Note: The interviewer explicitly invited clarifying questions here, so lean toward [CLARIFY:1|2|3] unless zero meaningful ambiguity remains.`
      : '';
    const pastWorkGuard = (!isCode && contextText && !explicitCue)
      ? `\n- CRITICAL: Your own past resume/project files are provided below—NEVER ask the interviewer for facts, metrics, or symptoms about your own past company or work; output [ANSWER].`
      : '';
    const clarifyOpeners = isCode
      ? [
          'Before I start writing code,',
          'Quick check before coding—',
          'Just to confirm the behavior first,',
          'Before I implement this,'
        ]
      : [
          'Before I lock in the design,',
          'Quick check first—',
          'Wait, before I start,',
          'Just to narrow scope first,'
        ];
    const pickedClarifyOpener = clarifyOpeners[(questionText || '').length % clarifyOpeners.length];

    const clarifyCriteria = isCode
      ? `- Output [CLARIFY:1], [CLARIFY:2], or [CLARIFY:3] whenever key coding specs are missing or ambiguous so a careful engineer would check first instead of guessing: [CLARIFY:1] for 1 quick edge-case check (empty/null/invalid input, return order, case sensitivity, or target constraints), [CLARIFY:2] for medium gaps (duplicate/tie-breaking rules, in-place vs new return value, eviction/TTL policy, or time vs space target), [CLARIFY:3] for complex builds missing thread-safety/concurrency, async/failure handling, or multi-method API contracts.${cueHint}
- Output [ANSWER] when the coding ask is genuinely simple/straightforward OR when inputs, outputs, examples, and constraints are already completely specified (so no real ambiguity remains).`
      : `- Output [CLARIFY:1], [CLARIFY:2], or [CLARIFY:3] whenever key product rules, scale/SLA expectations, scope, or conflicting engineering trade-offs are NOT pinned down yet—even if the prompt lists challenges or sub-topics (because listing technical challenges does not tell you which consistency trade-off, regional stock model, failure policy, or latency bound the interviewer wants). Choose depth naturally: [CLARIFY:1] for 1 quick check on a focused question, [CLARIFY:2] for a medium multi-part problem, [CLARIFY:3] for a hard multi-constraint design with multiple open trade-offs.${cueHint}${pastWorkGuard}
- Output [ANSWER] when the question is already self-contained and unambiguous enough to answer straight away—such as past resume work/incidents grounded in your files below, behavioral stories, or clear conceptual questions.`;
    const audioIgnoreRule = fromAudio
      ? `\n- Output [IGNORE] (and nothing else) ONLY if the captured audio is unmistakably non-interview background audio—such as song lyrics, video/ad commentary, unrelated room chatter, or an ambient remark with zero technical, coding, career, or interview intent. Whenever any real interview intent could be present, do NOT ignore—use [CLARIFY:...] or [ANSWER].`
      : '';
    const line1TagOptions = fromAudio
      ? '[ANSWER] or [CLARIFY:1] or [CLARIFY:2] or [CLARIFY:3] or [IGNORE]'
      : '[ANSWER] or [CLARIFY:1] or [CLARIFY:2] or [CLARIFY:3]';
    const ignoreFormatLine = fromAudio
      ? `\n- If [IGNORE]: Output literally ONLY "[IGNORE]" and nothing else.`
      : '';

    return `You are ${personaName} in a live technical interview (could be coding, system design, debugging, behavioral, or an open-ended challenge).${nameNote}
Think and react like a real human engineer—NOT an omniscient machine that guesses hidden business policy or pretends missing edge cases or trade-offs are already settled:

STEP 1 — DECIDE BY YOURSELF WHETHER A REAL ENGINEER WOULD CLARIFY FIRST OR ANSWER NOW:
${clarifyCriteria}${audioIgnoreRule}

OUTPUT FORMAT:
- Put ONLY ${line1TagOptions} on line 1, followed by a blank line.${ignoreFormatLine}
- If [CLARIFY:...]: Do NOT invent unstated business rules and do NOT write code or the full architecture yet. Open naturally (e.g., "${pickedClarifyOpener}" or direct spoken phrasing) and ask STRICTLY ONE single unknown in 1 short sentence (never ask two unknowns joined with "and" or "or"). Only use **bold** on a single crucial unknown term if helpful; leave short obvious questions unbolded. Zero contractions ("I would", "I am", "do not", "cannot"), no bullets, no # headers. Never mention difficulty labels or being an AI.
- If [ANSWER]: Immediately follow these exact rules:

${answerBlock}`;
  }

  if (mode === 'ClarifyFollowUp') {
    const followUpOpeners = ['Got it—', 'Makes sense—', 'Okay, quick follow-up—'];
    const pickedFollowOpener = followUpOpeners[(questionText || '').length % followUpOpeners.length];
    return `You are ${personaName} in a live technical interview, currently at clarification check ${clarifyInfo.currentRound} of up to ${clarifyInfo.targetDepth}.${nameNote}
Look closely at what the interviewer just answered in the conversation history above like an attentive human engineer:
- If you now understand enough critical pieces to give a grounded, coherent answer (or if the interviewer told you to proceed/make assumptions), output literally ONLY "[READY]" and nothing else.
- Otherwise (if a major gap still leaves you genuinely unsure how to construct the right design or code), briefly show you heard what they clarified (start cleanly, e.g., "${pickedFollowOpener}"), do NOT repeat anything already covered, do NOT write the full answer yet, and ask ONLY ONE crisp spoken follow-up question (1 short sentence) targeting the biggest remaining unknown.

VOICE RULES:
- Plain spoken English, active first-person ("I").
- Smart selective bolding: bold ONLY a crucial unknown term if truly helpful; leave short straightforward questions unbolded.
- Zero contractions (always spell out "I would", "I am", "it is", "can", "cannot", "do not").
- Never bundle multiple questions, no bullets, no code blocks, no # headers. Never mention being an AI.`;
  }

  if (mode === 'Coding') {
    let codingPrompt = `You are ${personaName} solving a live coding interview question out loud while writing clean code.${nameNote}\n\n${buildCodingAnswerRules()}`;
    if (clarifyInfo && clarifyInfo.justFinishedClarify) {
      codingPrompt += `\n\nIMPORTANT MULTI-TURN SYNTHESIS RULE: Clarifications are now complete for Turn 1 ("${clarifyInfo.anchorQuestion || ''}"). Write code and walk through it incorporating every clarified constraint, edge case, and preference discussed above.`;
    }
    return codingPrompt;
  }

  return `You are ${personaName} speaking out loud in a live technical interview.${nameNote}\n\n${buildTechnicalAnswerRules(questionText, contextText, clarifyInfo)}`;
}

function looksLikeNewStandaloneQuestion(text, ragEngine, anchorQuestion) {
  if (!text) return false;
  const clean = text.trim();
  const words = clean.split(/\s+/).filter(Boolean).length;
  if (/\b(?:switch\s+gears|different\s+question|new\s+question|next\s+question|another\s+question|different\s+topic|move\s+on\s+to|moving\s+on)\b/i.test(clean)) {
    return true;
  }
  if (ragEngine && ragEngine.isClarifyPromptCue && ragEngine.isClarifyPromptCue(clean)) {
    return true;
  }
  if (ragEngine && ragEngine.isPureGreenfieldDesign && ragEngine.isPureGreenfieldDesign(clean)) {
    return true;
  }
  if (ragEngine && ragEngine.isCodingTask && ragEngine.isCodingTask(clean)) {
    if (/\b(given\s+(?:an?|the|two)|example\s*\d*\s*:|input\s*:|output\s*:|from\s+scratch|leetcode|hackerrank|coderpad)\b/i.test(clean) || words >= 16) {
      return true;
    }
  }
  const hasFollowUpCue = /\b(?:it|that|this|those|them|earlier|mentioned|why\s+not|what\s+if|what\s+about|instead\s+of|can\s+you\s+(?:code|write|implement|explain)|how\s+(?:does|would|did)\s+(?:that|it|this)|elaborate|dive\s+deeper)\b/i.test(clean);
  if (/^(?:(?:okay|alright|great|now|next|so)\s*[,.—-]?\s*)*(?:design|architect)\s+(?:a|an)\b/i.test(clean) && !hasFollowUpCue) {
    return true;
  }
  const startsFresh = /^(?:so\s+)?(?:tell\s+me\s+about|walk\s+me\s+through|describe\s+a\s+time|can\s+you\s+tell\s+me\s+about)\b/i.test(clean);
  if (startsFresh && !hasFollowUpCue) {
    return true;
  }
  if (words >= 20 && !hasFollowUpCue && anchorQuestion && clean.toLowerCase() !== anchorQuestion.toLowerCase()) {
    return true;
  }
  return false;
}

function getTurnPlan(userText, options = {}) {
  const ragEngine = getRagEngine();
  const clean = (userText || '').trim();
  const fromAudio = Boolean(options && options.fromAudio);
  const isSmallTalk = ragEngine ? ragEngine.isGreetingOrSmallTalk(clean) : false;
  const isCoding = ragEngine && ragEngine.isCodingTask ? ragEngine.isCodingTask(clean) : false;
  const explicitClarifyCue = ragEngine && ragEngine.isClarifyPromptCue ? ragEngine.isClarifyPromptCue(clean) : false;
  const explicitTopicSwitch = clarifyState.clarifyActive && /\b(?:switch\s+gears|different\s+question|new\s+question|next\s+question|move\s+on)\b/i.test(clean);
  const midClarifyAVCheck = clarifyState.clarifyActive && isSmallTalk && /\b(hear\s+(?:and\s+see|me)|see\s+me|loud\s+and\s+clear|audio|video)\b/i.test(clean);

  if (midClarifyAVCheck) {
    return {
      mode: 'SmallTalk',
      expectTag: 'NONE',
      skipRag: true,
      isCoding: false,
      isCodeCall: false,
      keepClarifyState: true,
      clarifyInfo: null,
      anchorQuestion: clarifyState.anchorQuestion,
      ragQuery: clean,
      userMessageForApi: clean
    };
  }

  if (!clarifyState.clarifyActive && isSmallTalk) {
    return {
      mode: 'SmallTalk',
      expectTag: 'NONE',
      skipRag: true,
      isCoding: false,
      isCodeCall: false,
      keepClarifyState: false,
      clarifyInfo: null,
      anchorQuestion: '',
      ragQuery: clean,
      userMessageForApi: clean
    };
  }

  if (clarifyState.clarifyActive && !explicitTopicSwitch) {
    const anchorQuestion = clarifyState.anchorQuestion || (apiMessages[0] ? apiMessages[0].content : clean);
    const wantsEarlyStart = (ragEngine && ragEngine.isGoAheadCue ? ragEngine.isGoAheadCue(clean) : false) && !explicitClarifyCue;

    if (!wantsEarlyStart && clarifyState.currentRound < clarifyState.targetDepth) {
      const nextRound = clarifyState.currentRound + 1;
      return {
        mode: 'ClarifyFollowUp',
        expectTag: 'READY_OR_FOLLOWUP',
        skipRag: true,
        isCoding: clarifyState.originalMode === 'Coding' || isCoding,
        isCodeCall: false,
        clarifyInfo: {
          currentRound: nextRound,
          targetDepth: clarifyState.targetDepth,
          anchorQuestion
        },
        anchorQuestion,
        ragQuery: anchorQuestion,
        userMessageForApi: clean
      };
    }

    const clarifyWasCoding = (clarifyState.originalMode === 'Coding')
      || (ragEngine && ragEngine.isCodingTask ? ragEngine.isCodingTask(anchorQuestion + ' ' + clean) : isCoding);
    const solveMode = clarifyWasCoding ? 'Coding' : 'Technical/Design';
    const reAnchoredUserMsg = solveMode === 'Coding'
      ? `${clean}\n\n[Clarifications complete — Deliver the complete coding solution (Python by default unless another language was requested) with calm spoken syntax comments and crisp recap bullets anchored on Turn 1's main goal while honoring every clarified constraint above.]`
      : `${clean}\n\n[Clarifications complete — Give the concise 3-sentence final spoken solution anchored on Turn 1's main goal while honoring every clarified constraint above.]`;

    return {
      mode: solveMode,
      expectTag: 'NONE',
      skipRag: solveMode === 'Coding',
      isCoding: solveMode === 'Coding',
      isCodeCall: solveMode === 'Coding',
      justFinishedClarify: true,
      clarifyInfo: {
        justFinishedClarify: true,
        anchorQuestion,
        isCoding: solveMode === 'Coding'
      },
      anchorQuestion,
      ragQuery: anchorQuestion,
      userMessageForApi: reAnchoredUserMsg
    };
  }

  if (!explicitTopicSwitch && apiMessages.length > 0 && ragEngine && ragEngine.isFeedbackAck && ragEngine.isFeedbackAck(clean, true)) {
    return {
      mode: 'FeedbackAck',
      expectTag: 'NONE',
      skipRag: true,
      isCoding: false,
      isCodeCall: false,
      clarifyInfo: null,
      anchorQuestion: clarifyState.anchorQuestion || '',
      ragQuery: clean,
      userMessageForApi: clean
    };
  }

  if (apiMessages.length === 0 || explicitTopicSwitch || looksLikeNewStandaloneQuestion(clean, ragEngine, clarifyState.anchorQuestion)) {
    const isDirectPastResume = !isCoding && ragEngine && ragEngine.isPastExperienceQuestion && ragEngine.isPastExperienceQuestion(clean);
    if (isDirectPastResume) {
      return {
        mode: 'Technical/Design',
        expectTag: 'NONE',
        skipRag: false,
        isCoding: false,
        isCodeCall: false,
        clarifyInfo: {
          justFinishedClarify: false,
          anchorQuestion: clean,
          isCoding: false
        },
        anchorQuestion: clean,
        ragQuery: clean,
        userMessageForApi: clean
      };
    }

    return {
      mode: 'DynamicTurn1',
      expectTag: 'DYNAMIC',
      skipRag: isCoding,
      isCoding,
      isCodeCall: isCoding,
      clarifyInfo: {
        isCoding,
        explicitClarifyCue,
        anchorQuestion: clean,
        fromAudio
      },
      anchorQuestion: clean,
      ragQuery: clean,
      userMessageForApi: clean
    };
  }

  const anchorQuestion = clarifyState.anchorQuestion || (apiMessages[0] ? apiMessages[0].content : clean);
  const followMode = isCoding ? 'Coding' : 'Technical/Design';
  const isAnchorGreenfield = ragEngine && ragEngine.isPureGreenfieldDesign ? ragEngine.isPureGreenfieldDesign(anchorQuestion) : false;

  return {
    mode: followMode,
    expectTag: 'NONE',
    skipRag: isCoding || isAnchorGreenfield,
    isCoding,
    isCodeCall: isCoding,
    clarifyInfo: {
      justFinishedClarify: false,
      anchorQuestion,
      isCoding
    },
    anchorQuestion,
    ragQuery: clean + ' ' + anchorQuestion,
    userMessageForApi: clean
  };
}

async function loadSystemInstructions(userQuery = "", history = apiMessages, turnPlan = null) {
  try {
    const db = await ipcRenderer.invoke('get-db-data');
    if (db && db.settings) {
      // Refresh local keys list
      GEMINI_API_KEYS = [];
      if (db.settings.apiKey) GEMINI_API_KEYS.push({ type: 'primary', key: db.settings.apiKey });
      if (db.settings.apiKeyBackup1) GEMINI_API_KEYS.push({ type: 'backup1', key: db.settings.apiKeyBackup1 });
      if (db.settings.apiKeyBackup2) GEMINI_API_KEYS.push({ type: 'backup2', key: db.settings.apiKeyBackup2 });

      // Load Dynamic Model Name
      if (db.settings.selectedModel && SUPPORTED_MODELS.includes(db.settings.selectedModel)) {
        MODEL_NAME = db.settings.selectedModel;
      } else {
        MODEL_NAME = 'openai/gpt-oss-120b';
      }

      const ragEngine = getRagEngine();

      // Extract candidate identity dynamically from uploaded resume
      const rawResumeContent = (db.settings.resume && db.settings.resume.content) ? db.settings.resume.content : "";
      const extractedName = (ragEngine && ragEngine.extractCandidateName) ? ragEngine.extractCandidateName(rawResumeContent) : "";
      candidateName = extractedName || "a senior software engineer";

      const resumeText = rawResumeContent ? rawResumeContent.slice(0, 1200) : "";

      // Combine all context files and resume into unified RAG search pool
      const allContexts = [...(db.settings.contexts || [])];
      if (rawResumeContent) {
        allContexts.push({
          fileName: db.settings.resume.fileName || 'resume.txt',
          content: rawResumeContent
        });
      }

      const ragQuery = (turnPlan && turnPlan.ragQuery) ? turnPlan.ragQuery : userQuery;
      const isSmallTalk = ragEngine ? ragEngine.isGreetingOrSmallTalk(ragQuery) : false;
      const isCoding = (turnPlan && typeof turnPlan.isCoding === 'boolean')
        ? turnPlan.isCoding
        : (ragEngine && ragEngine.isCodingTask ? ragEngine.isCodingTask(ragQuery) : false);
      const anchorForGreenfield = (turnPlan && turnPlan.anchorQuestion) ? turnPlan.anchorQuestion : ragQuery;
      const isPureGreenfield = ragEngine && ragEngine.isPureGreenfieldDesign
        ? (ragEngine.isPureGreenfieldDesign(ragQuery) || ragEngine.isPureGreenfieldDesign(anchorForGreenfield))
        : false;
      const skipContext = !userQuery || (turnPlan && turnPlan.skipRag) || isSmallTalk || isCoding || isPureGreenfield;

      // Smart RAG Context Retrieval: dynamically match up to 3 relevant chunks within 4800 chars
      let contextText = "";
      let primarySource = null;
      if (allContexts.length > 0 && !skipContext) {
        if (ragEngine) {
          const res = ragEngine.getRelevantContext(ragQuery, allContexts, history, 3, 4800);
          contextText = (res && res.contextText) ? res.contextText : (typeof res === 'string' ? res : '');
          primarySource = (res && res.primarySource) ? res.primarySource : null;
        } else {
          allContexts.forEach(c => {
            contextText += `\n\n=== Context: ${c.fileName} ===\n${c.content}`;
          });
          const MAX_CONTEXT_CHARS = 4800;
          if (contextText.length > MAX_CONTEXT_CHARS) {
            contextText = contextText.substring(0, MAX_CONTEXT_CHARS);
          }
        }
      }

      // Only fall back to resume summary when explicitly asked about personal background/career and RAG had no narrow chunk
      const explicitPersonalAsk = /\b(yourself|introduce|background|career|resume|experience|progression|work\s+history|roles?|previous|last\s+company)\b/i.test(userQuery || '');
      const effectiveContext = (!skipContext)
        ? (contextText || (explicitPersonalAsk ? resumeText : ''))
        : '';

      latestSourceInfo = skipContext ? null : primarySource;

      const effectiveMode = turnPlan ? turnPlan.mode : (isSmallTalk ? 'SmallTalk' : (isCoding ? 'Coding' : 'Technical/Design'));
      const clarifyInfo = turnPlan ? turnPlan.clarifyInfo : null;
      systemInstructionText = buildSystemPrompt(effectiveMode, userQuery, effectiveContext, clarifyInfo);
    }
  } catch (err) {
    console.error("Failed to load instructions from local database:", err);
  }
}
// Load rules and persona context on app launch
loadSystemInstructions();

function attachSourceCitation(bubbleElement, sourceInfo) {
  if (!bubbleElement || !sourceInfo || !sourceInfo.fileName) return;
  if (bubbleElement.querySelector('.source-citation-badge')) return;

  const citationDiv = document.createElement('div');
  citationDiv.className = 'source-citation-badge';

  const lineStr = (sourceInfo.startLine && sourceInfo.endLine) 
    ? `${sourceInfo.startLine}-${sourceInfo.endLine}`
    : (sourceInfo.startLine ? `${sourceInfo.startLine}` : '');
  
  citationDiv.innerText = lineStr 
    ? `${sourceInfo.fileName} ${lineStr}`
    : `${sourceInfo.fileName}`;

  bubbleElement.appendChild(citationDiv);
  scrollToBottom();
}

// Intelligently splits a single long run-on sentence into two balanced sentences if the LLM merged its thoughts
function splitLongRunOnSentence(text) {
  if (!text || text.length < 75) return text;
  if (text.includes('\n') || text.includes('<br>')) return text;

  const sentenceMatches = text.match(/(?<!\d)[.!?](?:\s|$)/g) || [];
  if (sentenceMatches.length >= 2) {
    return text.replace(/(?<!\d)([.!?])\s+(?=[A-Z*])/g, '$1<br><br>');
  }

  const words = text.split(/\s+/);
  if (words.length < 22) return text;

  const patterns = [
    { regex: /;\s+/, replaceWith: '.<br><br>' },
    { regex: /,\s+which\s+/i, replaceWith: '.<br><br>This ' },
    { regex: /,\s+where\s+/i, replaceWith: '.<br><br>There ' },
    { regex: /,\s+while\s+/i, replaceWith: '.<br><br>Meanwhile, ' },
    { regex: /,\s+leading\s+to\s+/i, replaceWith: '.<br><br>This led to ' },
    { regex: /,\s+resulting\s+in\s+/i, replaceWith: '.<br><br>This resulted in ' },
    { regex: /,\s+and\s+then\s+/i, replaceWith: '.<br><br>Then ' },
    { regex: /,\s+and\s+/i, replaceWith: '.<br><br>' },
    { regex: /,\s+so\s+that\s+/i, replaceWith: '.<br><br>This allowed us to ' },
    { regex: /,\s+so\s+/i, replaceWith: '.<br><br>Consequently, ' },
    { regex: /,\s+but\s+/i, replaceWith: '.<br><br>However, ' }
  ];

  for (const { regex, replaceWith } of patterns) {
    const match = text.match(regex);
    if (match && match.index) {
      const charRatio = match.index / text.length;
      if (charRatio >= 0.28 && charRatio <= 0.72) {
        let firstPart = text.substring(0, match.index).trim();
        let secondPart = text.substring(match.index + match[0].length).trim();
        secondPart = secondPart.charAt(0).toUpperCase() + secondPart.slice(1);
        if (!/[.!?]$/.test(firstPart)) firstPart += '.';
        const prefix = replaceWith.includes('This') || replaceWith.includes('There') || replaceWith.includes('Meanwhile') || replaceWith.includes('Then') || replaceWith.includes('However') ? replaceWith.replace('.<br><br>', '') : '';
        return `${firstPart}<br><br>${prefix}${secondPart}`;
      }
    }
  }

  // Fallback: split at nearest comma near the middle
  const commaRegex = /,\s+/g;
  let m;
  let bestComma = -1;
  let bestDistance = Infinity;
  const midChar = text.length / 2;

  while ((m = commaRegex.exec(text)) !== null) {
    const dist = Math.abs(m.index - midChar);
    if (dist < bestDistance && m.index > text.length * 0.28 && m.index < text.length * 0.72) {
      bestDistance = dist;
      bestComma = m.index;
    }
  }

  if (bestComma !== -1) {
    let firstPart = text.substring(0, bestComma).trim();
    let secondPart = text.substring(bestComma + 2).trim();
    secondPart = secondPart.charAt(0).toUpperCase() + secondPart.slice(1);
    if (!/[.!?]$/.test(firstPart)) firstPart += '.';
    return `${firstPart}<br><br>${secondPart}`;
  }

  return text;
}

function wrapCommentLine(line, maxLen = 70) {
  const m = line.match(/^(\s*)(#|\/\/)\s+(.+)$/);
  if (!m || line.length <= maxLen) return line;
  const indent = m[1];
  const marker = m[2];
  const content = m[3].trim();
  const prefix = `${indent}${marker} `;
  const avail = Math.max(24, maxLen - prefix.length);
  if (content.length <= avail) return line;

  const words = content.split(/\s+/);
  const wrapped = [];
  let current = '';
  for (const w of words) {
    if (!current) {
      current = w;
    } else if (current.length + 1 + w.length <= avail) {
      current += ' ' + w;
    } else {
      wrapped.push(prefix + current);
      current = w;
    }
  }
  if (current) wrapped.push(prefix + current);
  return wrapped.join('\n');
}

function formatCodeBlockComments(code) {
  if (!code) return code;
  let seenSoFirst = false;
  const fallbackOpeners = ['Next', 'Then', 'Now'];
  let fallbackIdx = 0;

  return code
    .split(/\r?\n/)
    .map(rawLine => {
      let line = rawLine;
      const soFirstMatch = line.match(/^(\s*(?:#|\/\/)\s*)So first,\s+(.+)$/i);
      if (soFirstMatch) {
        if (!seenSoFirst) {
          seenSoFirst = true;
        } else {
          const opener = fallbackOpeners[fallbackIdx % fallbackOpeners.length];
          fallbackIdx++;
          line = `${soFirstMatch[1]}${opener} ${soFirstMatch[2]}`;
        }
      }
      return wrapCommentLine(line, 70);
    })
    .join('\n');
}

function formatMarkdown(text) {
  if (!text) return "";

  const applyInlineFormatting = (s) => s
    .replace(/`([^`]+)`/g, '<strong class="font-semibold text-white">$1</strong>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>');

  // Split by ``` to find code blocks (even indices are markdown text, odd indices are code blocks)
  const parts = text.split("```");
  let html = "";

  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      let textPart = parts[i].replace(/\r\n/g, '\n');
      if (i > 0) textPart = textPart.replace(/^\n+/, '');
      if (i < parts.length - 1) textPart = textPart.replace(/\n+$/, '');
      if (!textPart.trim()) continue;

      // Consolidate three or more consecutive newlines to two newlines
      textPart = textPart.replace(/\n{3,}/g, '\n\n');

      // Escape HTML entities to prevent XSS
      const escapedText = textPart
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const blocks = escapedText.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
      const formattedBlocks = blocks.map(block => {
        const lines = block.split('\n');
        const outLines = [];
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          if (/^\s*###\s+/.test(line)) {
            outLines.push(`<h3 class="text-xs font-semibold text-white mt-3 mb-1">${applyInlineFormatting(line.replace(/^\s*###\s+/, ''))}</h3>`);
          } else if (/^\s*##\s+/.test(line)) {
            outLines.push(`<h2 class="text-sm font-bold text-white mt-4 mb-2">${applyInlineFormatting(line.replace(/^\s*##\s+/, ''))}</h2>`);
          } else if (/^\s*#\s+/.test(line)) {
            outLines.push(`<h1 class="text-base font-black text-white mt-5 mb-2">${applyInlineFormatting(line.replace(/^\s*#\s+/, ''))}</h1>`);
          } else if (/^\s*[-*]\s+/.test(line)) {
            outLines.push(`<li class="ml-4 list-disc text-gray-300">${applyInlineFormatting(line.replace(/^\s*[-*]\s+/, ''))}</li>`);
          } else if (/^\s*(\d+)\.\s+/.test(line)) {
            const numMatch = line.match(/^\s*(\d+)\.\s+(.*)$/);
            outLines.push(`<div class="ml-4 text-sm text-gray-300 my-1" style="margin: 6px 0 !important; font-size: 14px !important;"><strong class="text-white">${numMatch[1]}.</strong> ${applyInlineFormatting(numMatch[2])}</div>`);
          } else {
            let proseLine = line.trim();
            if (!proseLine) continue;
            // Preserve decimals & version numbers (e.g. 99.9%, 0.001%, v2.0) while breaking multi-sentence lines
            const sentenceBreaks = proseLine.replace(/(?<!\d)([.!?])\s+(?=[A-Z*])/g, '$1<br><br>');
            if (sentenceBreaks !== proseLine) {
              proseLine = sentenceBreaks;
            } else {
              proseLine = splitLongRunOnSentence(proseLine);
            }
            outLines.push(applyInlineFormatting(proseLine));
          }
        }

        let blockHtml = '';
        for (let oi = 0; oi < outLines.length; oi++) {
          const cur = outLines[oi];
          if (oi > 0) {
            const prev = outLines[oi - 1];
            const prevIsBlock = /<\/(?:h\d|li|div)>\s*$/i.test(prev);
            const curIsBlock = /^<(?:h\d|li|div)\b/i.test(cur);
            if (!prevIsBlock && !curIsBlock) {
              blockHtml += '<br><br>';
            }
          }
          blockHtml += cur;
        }
        return blockHtml;
      }).filter(Boolean);

      html += formattedBlocks.join('<br><br>');
    } else {
      // Code block
      let codePart = parts[i];

      // Parse language tag on first line
      let lang = "python";
      let code = codePart;

      const firstNewline = codePart.indexOf("\n");
      if (firstNewline !== -1) {
        const potentialLang = codePart.substring(0, firstNewline).trim();
        if (potentialLang.length > 0 && potentialLang.length < 15) {
          lang = potentialLang.toLowerCase();
          code = codePart.substring(firstNewline + 1);
        }
      }

      // PROGRAMMATIC SPLIT FALLBACK:
      // If the code block contains comments like "# Example usage:" or "// Example usage:",
      // extract them and render them outside of the code block as plain text.
      let cleanCode = code.trim();
      let exampleText = "";

      const splitPatterns = [
        "# Example usage:",
        "// Example usage:",
        "/* Example usage",
        "# Example Usage:",
        "// Example Usage:",
        "# Example:",
        "// Example:",
        "# Output:",
        "// Output:"
      ];

      let splitIndex = -1;
      for (const pattern of splitPatterns) {
        const idx = cleanCode.indexOf(pattern);
        if (idx !== -1 && (splitIndex === -1 || idx < splitIndex)) {
          splitIndex = idx;
        }
      }

      if (splitIndex !== -1) {
        exampleText = cleanCode.substring(splitIndex);
        cleanCode = cleanCode.substring(0, splitIndex).trim();
      }

      cleanCode = formatCodeBlockComments(cleanCode);

      const normalizedLang = lang === 'js' ? 'javascript' : (lang === 'golang' ? 'go' : lang);
      const uniqueId = 'code-' + Math.random().toString(36).substr(2, 9);
      let highlightedCode = cleanCode;
      const grammar = (typeof Prism !== 'undefined' && Prism.languages)
        ? (Prism.languages[normalizedLang] || (normalizedLang === 'python' ? Prism.languages.python : Prism.languages.clike) || Prism.languages.python)
        : null;
      try {
        highlightedCode = grammar ? Prism.highlight(cleanCode, grammar, normalizedLang) : cleanCode
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      } catch (e) {
        highlightedCode = cleanCode
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");
      }

      html += `<div class="code-block-container my-3 rounded-lg overflow-hidden bg-gray-900 border border-theme-border/30 font-mono text-xs text-gray-200">
        <div class="code-block-header flex items-center justify-between px-3 py-1.5 bg-gray-800 border-b border-theme-border/20 text-[10px] text-gray-400 select-none">
          <span>${lang}</span>
          <button class="copy-code-btn" onclick="navigator.clipboard.writeText(document.getElementById('${uniqueId}').innerText); this.innerText='Copied!'; setTimeout(() => this.innerText='Copy', 2000)">Copy</button>
        </div>
        <pre class="p-3 overflow-x-auto"><code id="${uniqueId}" class="language-${normalizedLang}">${highlightedCode}</code></pre>
      </div>`;

      // If we extracted an example block, render it here as natural plain text below the code block container
      if (exampleText) {
        // Strip out code comment signs (#, //, /*, */) so it displays as clean plain text
        const cleanExample = exampleText
          .replace(/(#\s*Example usage:|#\s*Example Usage:|#\s*Example:|#\s*Output:|#\s*Output:|#|\/\/|\/\*|\*\/)/gi, "")
          .trim();
        if (cleanExample) {
          html += `<div class="text-sm text-gray-300 my-2.5 font-mono" style="margin: 10px 0 !important; font-size: 14px !important; line-height: 1.5;"><strong class="text-white">Example Output:</strong><br>${cleanExample.replace(/\n/g, '<br>')}</div>`;
        }
      }
    }
  }

  return html;
}

// AI Audio & Voice Activity Detection (VAD) Configuration
const SILENCE_DURATION = 2800;         // 2.8s natural pause buffer so Gemini TTS paragraph pauses do not cut off speech
const MAX_RECORDING_DURATION = 60000;  // 60s ceiling for long complex multi-paragraph interview questions
const MIN_RECORDING_DURATION = 800;    // Minimum 0.8s of audio to qualify

// State management
let audioStream = null;
let mediaRecorder = null;
let recordedChunks = [];

let audioContext = null;
let analyser = null;
let dataArray = null;
let sourceNode = null;

let isRecording = false;
let isMuted = false;             // Toggle to temporarily disable auto-listening
let silenceTimer = null;
let voiceSustainedTimer = null;  // For debouncing short notification sounds
let isProcessingResponse = false; // Prevent recording new sounds while Gemini is responding
let baselineNoiseFloor = 12;     // Dynamically adapts to ambient/game background audio
let maxRecordingTimer = null;    // Hard timeout safety valve
let recordingStartTime = 0;      // Track how long the current recording has run
let accumulatedQuestion = "";    // Stitches split sentences when user pauses between clauses
let isExpanded = false;
let chatPanelWidth = 680;
let chatPanelHeight = 260;

function updateWindowSize(animate = false) {
  const topBar = document.getElementById('top-bar-container') || controlBar || document.getElementById('control-bar');
  const topBarRect = topBar ? topBar.getBoundingClientRect() : null;
  const topBarWidth = topBarRect && topBarRect.width > 0 ? Math.ceil(topBarRect.width) : 340;
  const topBarHeight = topBarRect && topBarRect.height > 0 ? Math.ceil(topBarRect.height) : 50;
  const smm = sessionMenuModal || document.getElementById('session-menu-modal');
  const isMenuOpen = smm && !smm.classList.contains('collapsed-menu');
  const sessionModelOptions = document.getElementById('session-model-options');
  const isOptionsOpen = sessionModelOptions && !sessionModelOptions.classList.contains('hidden');

  let width, height;

  if (isExpanded) {
    // Flush against the chat panel (or top bar if panel is narrower) with zero outer padding
    const contentWidth = Math.max(chatPanelWidth, topBarWidth);
    width = Math.round(contentWidth);
    let minNeededHeight = topBarHeight + 12 + chatPanelHeight;
    if (isMenuOpen) {
      const menuHeight = isOptionsOpen ? 260 : 130;
      minNeededHeight = Math.max(minNeededHeight, topBarHeight + 8 + menuHeight);
    }
    height = Math.round(minNeededHeight);
  } else {
    // Collapsed pill mode: flush against top bar with zero outer padding
    width = Math.round(topBarWidth);
    if (isMenuOpen) {
      const menuHeight = isOptionsOpen ? 260 : 130;
      height = Math.round(topBarHeight + 8 + menuHeight);
    } else {
      height = Math.round(topBarHeight);
    }
  }

  ipcRenderer.send('resize-window', { width, height, animate });
}

// Initialize Session Duration Timer
let startTime = Date.now();
setInterval(() => {
  let elapsed = Math.floor((Date.now() - startTime) / 1000);
  let minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
  let seconds = (elapsed % 60).toString().padStart(2, '0');
  document.getElementById('session-timer').innerText = `${minutes}:${seconds}`;
}, 1000);

// Window Controls

// Recording button closes active session, saves it, and returns to landing
recordingCloseBtn.addEventListener('click', async () => {
  const duration = document.getElementById('session-timer').innerText;

  // Visual status feedback
  updateStatus("Generating title...", 'thinking');

  let aiTitle = "";
  const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
  if (sessionHistory.length > 0 && currentKey) {
    try {
      const historySnippet = sessionHistory.slice(-60).join("\n"); // use last 30 dialogue turns to capture the overall context
      const url = `https://api.groq.com/openai/v1/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [{
            role: "user",
            content: `Analyze this entire conversation and generate a consistent, professional title summarizing the overall topics discussed. The title MUST be a clean, descriptive sentence under 80 characters, without any quotation marks or punctuation. Do not focus on just the end topic, but capture the key highlights from start to finish. Conversation:\n\n${historySnippet}`
          }],
          max_tokens: 30
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.choices && result.choices[0] && result.choices[0].message) {
          aiTitle = result.choices[0].message.content.trim();
        }
      }
    } catch (e) {
      console.error("Failed to generate AI title, falling back to local extraction:", e);
    }
  }

  // Local fallback: if API failed or skipped, but conversation history exists
  if (!aiTitle && sessionHistory.length > 0) {
    const firstUserMsg = sessionHistory.find(msg => msg.startsWith("User: "));
    if (firstUserMsg) {
      const question = firstUserMsg.replace(/^User:\s*/i, "").trim();
      aiTitle = question.length > 80 ? question.substring(0, 77) + "..." : question;
    }
  }

  // Fallback if no conversation happened at all
  if (!aiTitle) {
    aiTitle = "Empty Session";
  }

  ipcRenderer.send('end-session', { duration, title: aiTitle, messages: savedSessionMessages });
});

// Esc key to minimize
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('minimize-window');
  }
});

expandToggleBtn.addEventListener('click', () => {
  isExpanded = !isExpanded;

  if (isExpanded) {
    chatPanel.classList.remove('collapsed-panel');
    chevronIcon.style.transform = 'rotate(180deg)';
    
    // Restore custom dimensions of chat panel
    chatPanel.style.width = `${chatPanelWidth}px`;
    chatPanel.style.height = `${chatPanelHeight}px`;
    
    // Resize Electron window dynamically to fit expanded layout
    updateWindowSize(false);
  } else {
    chatPanel.classList.add('collapsed-panel');
    chevronIcon.style.transform = 'rotate(0deg)';
    
    // Wait for the CSS transition (300ms) to finish before shrinking the Electron window
    setTimeout(() => {
      if (!isExpanded) {
        updateWindowSize(false);
        if (typeof positionMenuModal === 'function') positionMenuModal();
      }
    }, 300);
  }

  // Reposition the menu modal dynamically after layouts render
  setTimeout(() => {
    if (typeof positionMenuModal === 'function') positionMenuModal();
  }, 50);
});

// Enable/Disable send button based on text input OR attached screenshot
function updateSendButtonState() {
  if (chatInput.value.trim() !== '' || pendingScreenshot) {
    sendBtn.removeAttribute('disabled');
  } else {
    sendBtn.setAttribute('disabled', 'true');
  }
}

chatInput.addEventListener('input', () => {
  updateSendButtonState();
});

// Send message on Enter
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    if (chatInput.value.trim() !== '' || pendingScreenshot) {
      sendMessage();
    }
  }
});

sendBtn.addEventListener('click', () => {
  if (chatInput.value.trim() !== '' || pendingScreenshot) {
    sendMessage();
  }
});

function setScreenshotAttachment(dataUrl) {
  pendingScreenshot = dataUrl;
  if (screenshotDefaultIcon) screenshotDefaultIcon.classList.add('hidden');
  if (screenshotPreviewThumb) {
    screenshotPreviewThumb.src = dataUrl;
    screenshotPreviewThumb.classList.remove('hidden');
  }
  if (screenshotBtn) {
    screenshotBtn.classList.add('has-screenshot');
    screenshotBtn.title = 'Screenshot attached (Hover to remove)';
  }
  updateSendButtonState();
}

function clearScreenshotAttachment() {
  pendingScreenshot = null;
  if (screenshotDefaultIcon) screenshotDefaultIcon.classList.remove('hidden');
  if (screenshotPreviewThumb) {
    screenshotPreviewThumb.src = '';
    screenshotPreviewThumb.classList.add('hidden');
  }
  if (screenshotRemoveOverlay) screenshotRemoveOverlay.classList.add('hidden');
  if (screenshotBtn) {
    screenshotBtn.classList.remove('has-screenshot');
    screenshotBtn.title = 'Take Screenshot';
  }
  updateSendButtonState();
}

if (screenshotBtn) {
  screenshotBtn.addEventListener('click', async (e) => {
    if (e.target.closest('#screenshot-remove-overlay')) {
      return;
    }
    if (pendingScreenshot) {
      return;
    }
    try {
      screenshotBtn.style.opacity = '0.5';
      const dataUrl = await ipcRenderer.invoke('capture-screen');
      if (dataUrl) {
        setScreenshotAttachment(dataUrl);
      }
    } catch (err) {
      console.error("Failed to capture screen:", err);
    } finally {
      if (screenshotBtn) screenshotBtn.style.opacity = '';
    }
  });
}

if (screenshotRemoveOverlay) {
  screenshotRemoveOverlay.addEventListener('click', (e) => {
    e.stopPropagation();
    clearScreenshotAttachment();
  });
}

function sendMessage() {
  const text = chatInput.value.trim();
  const attachedImage = pendingScreenshot;
  if (!text && !attachedImage) return;

  chatInput.value = '';
  clearScreenshotAttachment();
  updateSendButtonState();

  sendTextMessage(text, attachedImage);
}

function appendMessage(text, sender, label = "", source = null, attachedImage = null) {
  const groupDiv = document.createElement('div');
  groupDiv.classList.add('flex', 'flex-col', 'w-full');
  if (sender === 'user') {
    groupDiv.classList.add('items-end');
  } else {
    groupDiv.classList.add('items-start');
  }
  
  let labelDiv = null;
  if (label) {
    labelDiv = document.createElement('div');
    labelDiv.classList.add('message-label', 'mb-1', 'select-none');
    if (label.includes('<span')) {
      labelDiv.innerHTML = label;
    } else {
      labelDiv.innerText = label;
    }
    groupDiv.appendChild(labelDiv);
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  if (sender === 'ai') {
    msgDiv.innerHTML = formatMarkdown(text);
    msgDiv.dataset.rawText = text;
    if (source) {
      attachSourceCitation(msgDiv, source);
    }
  } else {
    if (text) {
      const textDiv = document.createElement('div');
      textDiv.innerText = text;
      msgDiv.appendChild(textDiv);
    }
    if (attachedImage) {
      const imgContainer = document.createElement('div');
      imgContainer.classList.add('chat-screenshot-container');
      const imgElem = document.createElement('img');
      imgElem.src = attachedImage;
      imgElem.alt = 'Screenshot';
      imgElem.classList.add('chat-screenshot-img');
      imgElem.title = 'Click to open full preview';
      imgElem.addEventListener('click', () => {
        const previewWin = window.open('');
        if (previewWin) {
          previewWin.document.write(`<img src="${attachedImage}" style="max-width:100%;height:auto;margin:auto;display:block;background:#000;" />`);
          previewWin.document.body.style.background = '#0a0a0a';
        }
      });
      imgContainer.appendChild(imgElem);
      msgDiv.appendChild(imgContainer);
    }
  }
  groupDiv.appendChild(msgDiv);
  
  messagesList.appendChild(groupDiv);
  return { groupDiv, msgDiv, labelDiv };
}

// Find position of the next complete JSON object in a stream buffer
function findNextJsonObject(str) {
  let braceCount = 0;
  let inString = false;
  let escaped = false;
  let startIdx = -1;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') {
        if (braceCount === 0) {
          startIdx = i;
        }
        braceCount++;
      } else if (char === '}') {
        braceCount--;
        if (braceCount === 0 && startIdx !== -1) {
          return i + 1; // Return index right after matching closing brace
        }
      }
    }
  }
  return -1;
}

function getActionBadge(tagType, tagDepth, turnPlan) {
  if (tagType === 'CLARIFY') {
    return `**Ask Back (Clarify 1/${tagDepth}):**`;
  }
  if (turnPlan && turnPlan.mode === 'ClarifyFollowUp') {
    const info = turnPlan.clarifyInfo || {};
    return `**Ask Back (Clarify ${info.currentRound || 1}/${info.targetDepth || 1}):**`;
  }
  if (turnPlan && (turnPlan.mode === 'SmallTalk' || turnPlan.mode === 'FeedbackAck')) {
    return '**Quick Reply:**';
  }
  return '**Answer:**';
}

function createStreamPrefixProcessor(turnPlan, expectTag = 'NONE') {
  const state = {
    expectTag,
    turnPlan,
    pending: '',
    tagParsed: false,
    startedBody: false,
    tagType: null,
    tagDepth: 0,
    parsedTagName: '',
    suppressOutput: false,
    cleanBodyText: '',
    uiText: '',
    needsFallback: false
  };

  function resolvePending(isEof = false) {
    if (state.suppressOutput) return;

    if (!state.tagParsed) {
      const trimmedLeft = state.pending.replace(/^\s+/, '');
      if (!trimmedLeft) {
        if (isEof && state.expectTag !== 'NONE') {
          state.tagParsed = true;
          state.tagType = 'NONE';
        }
        return;
      }

      if (trimmedLeft[0] === '[') {
        const tagMatch = trimmedLeft.match(/^\[([A-Za-z]+(?::[0-9]+)?)\](?:\s*)/);
        if (tagMatch) {
          const inner = tagMatch[1].toUpperCase();
          state.parsedTagName = inner;
          state.tagParsed = true;

          if (state.expectTag === 'READY_OR_FOLLOWUP' && inner === 'READY') {
            state.tagType = 'READY';
            state.suppressOutput = true;
            state.pending = '';
            return;
          }

          if (state.expectTag === 'DYNAMIC' && inner === 'IGNORE') {
            state.tagType = 'IGNORE';
            state.suppressOutput = true;
            state.pending = '';
            return;
          }

          const clarifyMatch = inner.match(/^(?:CLARIFY|DEPTH):([1-3])$/);
          if (state.expectTag === 'DYNAMIC' && clarifyMatch) {
            state.tagType = 'CLARIFY';
            state.tagDepth = parseInt(clarifyMatch[1], 10);
            state.pending = trimmedLeft.slice(tagMatch[0].length);
          } else if (inner === 'ANSWER' || inner === 'DEPTH:0') {
            state.tagType = 'ANSWER';
            state.pending = trimmedLeft.slice(tagMatch[0].length);
          } else {
            state.tagType = 'NONE';
            state.pending = trimmedLeft;
          }
        } else if (!isEof && trimmedLeft.length < 22 && !/\s/.test(trimmedLeft)) {
          return;
        } else {
          state.tagParsed = true;
          state.tagType = 'NONE';
          state.pending = trimmedLeft;
        }
      } else {
        state.tagParsed = true;
        state.tagType = 'NONE';
        state.pending = trimmedLeft;
      }
    }

    if (state.tagParsed && !state.startedBody) {
      state.pending = state.pending.replace(/^\s+/, '');
      if (!state.pending) {
        if (isEof && (state.parsedTagName === 'DEPTH:0' || state.parsedTagName === 'ANSWER')) {
          state.needsFallback = true;
        }
        return;
      }
      state.startedBody = true;
      state.cleanBodyText = state.pending;
      state.pending = '';
      const badge = getActionBadge(state.tagType, state.tagDepth, state.turnPlan);
      state.uiText = `${badge}\n\n${state.cleanBodyText}`;
      return;
    }

    if (state.startedBody && state.pending) {
      state.cleanBodyText += state.pending;
      state.pending = '';
      const badge = getActionBadge(state.tagType, state.tagDepth, state.turnPlan);
      state.uiText = `${badge}\n\n${state.cleanBodyText}`;
    }
  }

  return {
    state,
    pushChunk(deltaText) {
      if (!deltaText || state.suppressOutput) return false;
      state.pending += deltaText;
      const prevUi = state.uiText;
      resolvePending(false);
      return state.uiText !== prevUi;
    },
    finish() {
      resolvePending(true);
      return {
        tagType: state.tagType,
        tagDepth: state.tagDepth,
        suppressOutput: state.suppressOutput,
        needsFallback: state.needsFallback,
        cleanBodyText: state.cleanBodyText.trim(),
        uiText: state.uiText.trim(),
        hasDisplayedContent: state.startedBody && state.cleanBodyText.trim().length > 0
      };
    }
  };
}

// Read Groq SSE stream with prefix tag buffering and output formatted chunks into a message bubble in real-time
async function streamResponse(response, replyBubble, options = {}) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  const expectTag = options.expectTag || 'NONE';
  const turnPlan = options.turnPlan || null;
  const processor = createStreamPrefixProcessor(turnPlan, expectTag);

  let buffer = "";
  let hasDisplayed = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer
      buffer = lines.pop();

      for (const line of lines) {
        const cleanLine = line.trim();
        if (!cleanLine || !cleanLine.startsWith("data: ")) continue;
        const jsonStr = cleanLine.substring(6).trim();
        if (jsonStr === "[DONE]") continue;
        try {
          const data = JSON.parse(jsonStr);
          if (data.choices && data.choices[0] && data.choices[0].delta) {
            const delta = data.choices[0].delta;
            if (delta.reasoning && !hasDisplayed) {
              updateStatus("Reasoning...", 'thinking');
            }
            if (delta.content) {
              const updated = processor.pushChunk(delta.content);
              if (processor.state.suppressOutput) {
                reader.cancel().catch(() => {});
                break;
              }
              if (updated) {
                if (!hasDisplayed) {
                  replyBubble.innerHTML = "";
                  hasDisplayed = true;
                  updateStatus("Responding...", 'thinking');
                }
                replyBubble.dataset.rawText = processor.state.uiText;
                replyBubble.innerHTML = formatMarkdown(processor.state.uiText);
                scrollToBottom();
              }
            }
          }
        } catch (e) {
          // Wait for next buffer data
        }
      }

      if (processor.state.suppressOutput) break;
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw error;
    }
    console.error("Stream reader loop error:", error);
    replyBubble.innerText += "\n[Error streaming: " + error.message + "]";
  }

  const finalResult = processor.finish();
  if (finalResult.hasDisplayedContent && !finalResult.suppressOutput) {
    replyBubble.dataset.rawText = finalResult.uiText;
    replyBubble.innerHTML = formatMarkdown(finalResult.uiText);
    scrollToBottom();
  } else if (!finalResult.suppressOutput && !finalResult.needsFallback && !hasDisplayed) {
    replyBubble.innerText = "Sorry, I could not generate a response.";
  }

  return finalResult;
}

// Obsolete for Groq - wrapper to redirect
async function streamAudioResponse(response, statusIndicator, replyBubble) {
  await streamResponse(response, replyBubble);
}

function showListeningIndicator() {
  const existing = document.getElementById('listening-indicator');
  const statusMsg = isMuted ? 'AI is paused...' : 'AI is listening right now...';
  if (existing) {
    const msg = existing.querySelector('.message') || existing;
    msg.innerText = statusMsg;
    return;
  }
  
  const groupDiv = document.createElement('div');
  groupDiv.id = 'listening-indicator';
  groupDiv.classList.add('flex', 'flex-col', 'w-full', 'items-start');
  
  const labelDiv = document.createElement('div');
  labelDiv.classList.add('message-label', 'mb-1', 'select-none');
  labelDiv.innerText = 'AI Status';
  groupDiv.appendChild(labelDiv);
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', 'ai');
  msgDiv.innerText = statusMsg;
  groupDiv.appendChild(msgDiv);
  
  messagesList.appendChild(groupDiv);
  scrollToBottom();
}

function removeListeningIndicator() {
  const indicator = document.getElementById('listening-indicator');
  if (indicator) {
    indicator.remove();
  }
}

function formatIgnoredPickupText(reasonType, pickedText = '') {
  const clean = String(pickedText || '').replace(/\s+/g, ' ').trim();
  const snippet = clean.length > 56 ? clean.slice(0, 53).trimEnd() + '...' : clean;
  if (reasonType === 'noise') {
    return snippet && !/^[\[\(♪♫]/.test(snippet)
      ? `AI picked up background sound ("${snippet}") — skipped so it does not make an irrelevant response.`
      : 'AI picked up background sound or music — skipped so it does not make an irrelevant response.';
  }
  return snippet
    ? `AI picked up non-question audio ("${snippet}") — skipped so it does not make an irrelevant response.`
    : 'AI picked up non-question audio — skipped so it does not make an irrelevant response.';
}

function showIgnoredPickupNotice(reasonType, pickedText = '') {
  if (!messagesList) return null;
  const noticeText = formatIgnoredPickupText(reasonType, pickedText);
  const lastChild = messagesList.lastElementChild || null;

  if (lastChild && lastChild.classList && lastChild.classList.contains('pickup-skip-notice')) {
    const prevBase = (lastChild.dataset && lastChild.dataset.baseText) || '';
    const nextCount = prevBase === noticeText
      ? (parseInt((lastChild.dataset && lastChild.dataset.skipCount) || '1', 10) + 1)
      : 1;
    if (lastChild.dataset) {
      lastChild.dataset.baseText = noticeText;
      lastChild.dataset.skipCount = String(nextCount);
    }
    lastChild.innerText = nextCount > 1 ? `${noticeText} (×${nextCount})` : noticeText;
    scrollToBottom();
    return lastChild;
  }

  const noticeDiv = document.createElement('div');
  noticeDiv.classList.add('pickup-skip-notice');
  if (noticeDiv.dataset) {
    noticeDiv.dataset.baseText = noticeText;
    noticeDiv.dataset.skipCount = '1';
  }
  noticeDiv.innerText = noticeText;
  messagesList.appendChild(noticeDiv);
  scrollToBottom();
  return noticeDiv;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Update UI Status (Visual state of wave gif and status text)
function updateStatus(text, stateClass = '') {
  if (statusText) statusText.innerText = text;
  
  // Manage wave icon src and opacity based on active/paused state
  if (audioWaveGif) {
    if (isMuted) {
      if (!audioWaveGif.src.endsWith('session.pause.png')) {
        audioWaveGif.src = '../../assets/icons/session.pause.png';
      }
      // Keep paused wave icon bright white just like on play
      audioWaveGif.style.opacity = '0.85';
      return;
    }
    
    if (!audioWaveGif.src.endsWith('session.play.png')) {
      audioWaveGif.src = '../../assets/icons/session.play.png';
    }
    if (stateClass === 'listening') {
      audioWaveGif.style.opacity = '0.85';
    } else if (stateClass === 'thinking') {
      audioWaveGif.style.opacity = '0.4';
    } else {
      audioWaveGif.style.opacity = '0.85';
    }
  }
}

function buildGroqRequestPayload(promptText, userContent, isCodeCall, attachedImage = null) {
  let activeModel = MODEL_NAME;
  let userPayloadContent = userContent;

  if (attachedImage) {
    // If current model is text-only (gpt-oss), automatically route to Qwen vision model
    if (!activeModel.includes('qwen')) {
      activeModel = 'qwen/qwen3.8-27b';
    }
    userPayloadContent = [
      { type: 'text', text: userContent },
      { type: 'image_url', image_url: { url: attachedImage } }
    ];
  }

  const payload = {
    model: activeModel,
    temperature: isCodeCall ? 0.4 : 0.5,
    max_tokens: isCodeCall ? 2800 : 800,
    messages: [
      { role: 'system', content: promptText },
      ...apiMessages.slice(-6),
      { role: 'user', content: userPayloadContent }
    ],
    stream: true
  };
  if (activeModel.includes('oss')) {
    payload.reasoning_effort = isCodeCall ? 'medium' : 'low';
  } else if (activeModel.includes('qwen')) {
    payload.reasoning_effort = 'default';
  }
  return payload;
}

async function fetchGroqChatWithFailover(buildPayloadFn, labelDiv, signal) {
  const url = 'https://api.groq.com/openai/v1/chat/completions';
  while (true) {
    const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
    const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';

    if (!currentKey) {
      throw new Error('NO_API_KEY');
    }

    const reqPayload = buildPayloadFn();
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentKey}`
      },
      body: JSON.stringify(reqPayload),
      signal
    });

    if (!response.ok) {
      const errText = await response.text();
      const failStatus = (response.status === 429 || response.status === 413)
        ? 'rate-limited'
        : (response.status === 401 ? 'invalid' : 'healthy');
      ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

      if ((response.status === 429 || response.status === 400) && rotateApiKey(labelDiv)) {
        continue;
      }
      throw new Error(`HTTP ${response.status}: ${errText}`);
    }

    return { response, currentType };
  }
}

function commitCompletedTurn(questionText, finalPlan, streamResult, replyBubble) {
  const finalUiText = streamResult.uiText || replyBubble.dataset.rawText || replyBubble.innerText;
  const finalBodyText = streamResult.cleanBodyText || finalUiText;
  const isAskingClarify = (streamResult.tagType === 'CLARIFY') || (finalPlan.mode === 'ClarifyFollowUp');
  const citedSource = isAskingClarify ? null : latestSourceInfo;

  if (citedSource) {
    attachSourceCitation(replyBubble, citedSource);
  }

  if (streamResult.tagType === 'CLARIFY') {
    clarifyState = {
      clarifyActive: true,
      targetDepth: streamResult.tagDepth || 1,
      currentRound: 1,
      originalMode: finalPlan.isCoding ? 'Coding' : 'Technical/Design',
      anchorQuestion: questionText
    };
  } else if (finalPlan.mode === 'ClarifyFollowUp') {
    clarifyState = {
      ...clarifyState,
      clarifyActive: true,
      currentRound: (finalPlan.clarifyInfo && finalPlan.clarifyInfo.currentRound)
        ? finalPlan.clarifyInfo.currentRound
        : (clarifyState.currentRound + 1)
    };
  } else if (finalPlan.mode === 'SmallTalk' && finalPlan.keepClarifyState) {
    // Preserve active clarify session after brief mid-call audio/video check
  } else if (finalPlan.mode === 'SmallTalk' || finalPlan.mode === 'FeedbackAck') {
    clarifyState = {
      ...clarifyState,
      clarifyActive: false
    };
  } else {
    clarifyState = {
      clarifyActive: false,
      targetDepth: finalPlan.justFinishedClarify ? clarifyState.targetDepth : 0,
      currentRound: 0,
      originalMode: finalPlan.mode === 'Coding' ? 'Coding' : 'Technical/Design',
      anchorQuestion: finalPlan.anchorQuestion || questionText
    };
  }

  sessionHistory.push(`User: ${questionText}`);
  sessionHistory.push(`AI: ${finalUiText}`);
  savedSessionMessages.push({ role: 'user', content: questionText });
  savedSessionMessages.push({ role: 'assistant', content: finalUiText, source: citedSource });
  apiMessages.push({ role: 'user', content: questionText });
  apiMessages.push({ role: 'assistant', content: finalBodyText });
}

// Shared turn execution for both typed questions and live transcribed interview audio
async function executeInterviewQuery(questionText, replyBubble, labelDiv, options = {}) {
  const ragEngine = getRagEngine();
  const attachedImage = options ? options.attachedImage : null;
  const historyQuestionText = (options && options.historyQuestionText) ? options.historyQuestionText : questionText;
  const initialPlan = getTurnPlan(questionText, { fromAudio: Boolean(options && options.fromAudio) });

  if (attachedImage) {
    initialPlan.mode = 'Coding';
    initialPlan.isCoding = true;
    initialPlan.isCodeCall = true;
    initialPlan.expectTag = 'NONE';
    const baseCodingDirective = "Analyze the technical problem, code, or architecture shown in this interview screenshot. Adhere strictly to the Ciyper coding format: 1 short spoken opening strategy sentence before the code block, clean bug-free code matching any platform entrypoint (like 'class Solution:') with line-by-line calm spoken syntax comments strictly directly ABOVE each line matching indentation starting with '# So first,', and a short footer with exactly 2 takeaway bullets and 1 Time/Space complexity bullet.";
    if (!questionText || questionText === "Analyze the problem or code shown in this screenshot.") {
      initialPlan.userMessageForApi = baseCodingDirective;
    } else {
      initialPlan.userMessageForApi = `${questionText}\n\n[Instruction: ${baseCodingDirective}]`;
    }
  }

  while (true) {
    try {
      await loadSystemInstructions(questionText, apiMessages, initialPlan);

      const abortSignal = activeAbortController ? activeAbortController.signal : undefined;
      const { response, currentType } = await fetchGroqChatWithFailover(
        () => buildGroqRequestPayload(systemInstructionText, initialPlan.userMessageForApi, initialPlan.isCodeCall, attachedImage),
        labelDiv,
        abortSignal
      );

      let streamResult = await streamResponse(response, replyBubble, {
        expectTag: initialPlan.expectTag,
        turnPlan: initialPlan
      });
      let activePlan = initialPlan;
      let activeKeyType = currentType;

      // ClarifyFollowUp dynamically signaled [READY] -> transition immediately to re-anchored solution in same bubble
      if (initialPlan.mode === 'ClarifyFollowUp' && streamResult.tagType === 'READY') {
        updateStatus("Preparing answer...", 'thinking');
        const anchorQuestion = initialPlan.anchorQuestion || questionText;
        const solveIsCoding = (clarifyState.originalMode === 'Coding')
          || (ragEngine && ragEngine.isCodingTask ? ragEngine.isCodingTask(anchorQuestion + ' ' + questionText) : false);
        const solveMode = solveIsCoding ? 'Coding' : 'Technical/Design';
        const reAnchoredUserMsg = solveMode === 'Coding'
          ? `${questionText}\n\n[Clarifications complete — Deliver the complete coding solution (Python by default unless another language was requested) with calm spoken syntax comments and crisp recap bullets anchored on Turn 1's main goal while honoring every clarified constraint above.]`
          : `${questionText}\n\n[Clarifications complete — Give the concise 3-sentence final spoken solution anchored on Turn 1's main goal while honoring every clarified constraint above.]`;

        activePlan = {
          mode: solveMode,
          expectTag: 'NONE',
          skipRag: solveMode === 'Coding',
          isCoding: solveMode === 'Coding',
          isCodeCall: solveMode === 'Coding',
          justFinishedClarify: true,
          clarifyInfo: {
            justFinishedClarify: true,
            anchorQuestion,
            isCoding: solveMode === 'Coding'
          },
          anchorQuestion,
          ragQuery: anchorQuestion,
          userMessageForApi: reAnchoredUserMsg
        };

        await loadSystemInstructions(questionText, apiMessages, activePlan);
        const solveFetch = await fetchGroqChatWithFailover(
          () => buildGroqRequestPayload(systemInstructionText, activePlan.userMessageForApi, activePlan.isCodeCall),
          labelDiv,
          abortSignal
        );
        activeKeyType = solveFetch.currentType;
        streamResult = await streamResponse(solveFetch.response, replyBubble, {
          expectTag: 'NONE',
          turnPlan: activePlan
        });
      } else if (initialPlan.mode === 'DynamicTurn1' && streamResult.needsFallback) {
        // Defensive fallback if model emitted only [DEPTH:0] without response body
        const solveMode = initialPlan.isCoding ? 'Coding' : 'Technical/Design';
        activePlan = {
          mode: solveMode,
          expectTag: 'NONE',
          skipRag: solveMode === 'Coding',
          isCoding: solveMode === 'Coding',
          isCodeCall: solveMode === 'Coding',
          justFinishedClarify: false,
          clarifyInfo: { isCoding: solveMode === 'Coding', anchorQuestion: questionText },
          anchorQuestion: questionText,
          ragQuery: questionText,
          userMessageForApi: questionText
        };

        await loadSystemInstructions(questionText, apiMessages, activePlan);
        const fallbackFetch = await fetchGroqChatWithFailover(
          () => buildGroqRequestPayload(systemInstructionText, activePlan.userMessageForApi, activePlan.isCodeCall),
          labelDiv,
          abortSignal
        );
        activeKeyType = fallbackFetch.currentType;
        streamResult = await streamResponse(fallbackFetch.response, replyBubble, {
          expectTag: 'NONE',
          turnPlan: activePlan
        });
      }

      if (streamResult.tagType === 'IGNORE') {
        if (replyBubble && replyBubble.dataset) {
          replyBubble.dataset.ignoredPickup = 'true';
        }
        ipcRenderer.send('set-key-status', { keyType: activeKeyType, status: 'healthy' });
        ipcRenderer.send('increment-api-usage', { keyType: activeKeyType });
        return true;
      }

      commitCompletedTurn(historyQuestionText, activePlan, streamResult, replyBubble);
      ipcRenderer.send('set-key-status', { keyType: activeKeyType, status: 'healthy' });
      ipcRenderer.send('increment-api-usage', { keyType: activeKeyType });
      return true;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("Request aborted.");
        if (replyBubble && replyBubble.innerText === "Thinking...") {
          replyBubble.innerText = "[Interrupted]";
        }
        return false;
      }

      if (error.message === 'NO_API_KEY') {
        if (replyBubble) {
          replyBubble.innerText = "Error: No API Key available. Please configure keys in Settings.";
        }
        return false;
      }

      const activeType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';
      const failStatus = (error.message.includes("429") || error.message.includes("413") || error.message.includes("tokens per minute"))
        ? 'rate-limited'
        : (error.message.includes("401") ? 'invalid' : 'healthy');
      ipcRenderer.send('set-key-status', { keyType: activeType, status: failStatus });

      if (rotateApiKey(labelDiv)) {
        continue;
      }

      if (replyBubble) {
        if (error.message.includes("413") || error.message.includes("Request too large") || error.message.includes("tokens per minute")) {
          replyBubble.innerText = "Context limit reached. Please ask a shorter question.";
        } else if (error.message.includes("429") || error.message.includes("rate_limit")) {
          replyBubble.innerText = "API rate limit reached. Please wait a moment and try again.";
        } else if (error.message.includes("401") || error.message.includes("invalid_api_key")) {
          replyBubble.innerText = "Invalid API key. Please check your key in Settings.";
        } else {
          replyBubble.innerText = "Unable to process response: " + error.message;
        }
      }
      return false;
    }
  }
}

// Groq Text & Multimodal Query
async function sendTextMessage(text, attachedImage = null) {
  removeListeningIndicator();

  // Abort any active query before starting a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  const userDisplayText = text;
  const historyQuestionText = attachedImage
    ? (text ? `[Screenshot Attached] ${text}` : `[Screenshot Analysis]`)
    : text;
  const userQueryText = text || (attachedImage ? "Analyze the technical problem, code, or architecture shown in this interview screenshot. Identify what is being asked and provide a concise, structured first-person candidate response with the optimal approach and clean code." : "");

  appendMessage(userDisplayText, 'user', 'Me', null, attachedImage);
  const activeModelDisplay = attachedImage && !MODEL_NAME.includes('qwen') ? 'qwen/qwen3.8-27b' : getFriendlyModelName(MODEL_NAME);
  const { msgDiv: replyBubble, labelDiv } = appendMessage("Thinking...", 'ai', `${getActiveKeyLabel()} • ${activeModelDisplay}`);
  scrollToBottom();

  isProcessingResponse = true;
  updateStatus("Thinking...", 'thinking');

  try {
    await executeInterviewQuery(userQueryText, replyBubble, labelDiv, { attachedImage, historyQuestionText });
  } catch (outerErr) {
    console.error("Unhandled error in sendTextMessage:", outerErr);
    if (replyBubble && replyBubble.innerText === "Thinking...") {
      replyBubble.innerText = "Error: " + outerErr.message;
    }
  } finally {
    isProcessingResponse = false;
    updateStatus(isMuted ? "AI is paused..." : "Listening for sound...", isMuted ? 'muted' : 'listening');
    showListeningIndicator();
    scrollToBottom();
  }
}

// --- Auto-Listening & Silence Detection Logic ---

// Get loopback audio stream
async function startSystemAudioCapture() {
  try {
    const sources = await ipcRenderer.invoke('get-desktop-sources');
    const primarySource = sources.find(source => 
      source.name === 'Entire Screen' || 
      source.name.toLowerCase().includes('screen') || 
      source.id.startsWith('screen:')
    );
    
    if (!primarySource) {
      throw new Error("Could not find screen source");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: primarySource.id
        }
      }
    });

    // Close video track immediately
    stream.getVideoTracks().forEach(track => track.stop());
    const audioTrack = stream.getAudioTracks()[0];
    return new MediaStream([audioTrack]);
  } catch (err) {
    console.error("System audio capture failed:", err);
    throw err;
  }
}

// Web Audio API analysis setup with Voice Frequency Bandpass
function initAudioAnalysis(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 512; // 256 frequency bins for finer frequency resolution
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  
  sourceNode = audioContext.createMediaStreamSource(stream);

  // 1. Highpass filter to eliminate sub-bass rumbles & game bass beats below 100Hz
  const hpFilter = audioContext.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 100;

  // 2. Lowpass filter to cut out high-frequency synth bells & laser SFX above 3400Hz
  const lpFilter = audioContext.createBiquadFilter();
  lpFilter.type = 'lowpass';
  lpFilter.frequency.value = 3400;

  // Connect stream -> HP filter -> LP filter -> Analyser
  sourceNode.connect(hpFilter);
  hpFilter.connect(lpFilter);
  lpFilter.connect(analyser);
  
  monitorVolume();
}

// Continuous Voice Activity Detection (VAD) & Adaptive Noise Loop
function monitorVolume() {
  if (!analyser || isMuted || isProcessingResponse) {
    requestAnimationFrame(monitorVolume);
    return;
  }
  
  analyser.getByteFrequencyData(dataArray);
  
  // Isolate human vocal formant energy (~180Hz to ~2800Hz, bins 2 to 30)
  let vocalSum = 0;
  let vocalBins = 0;
  let totalSum = 0;
  let maxVal = 0;
  
  for (let i = 0; i < dataArray.length; i++) {
    const val = dataArray[i];
    totalSum += val;
    if (val > maxVal) maxVal = val;
    
    if (i >= 2 && i <= 30) {
      vocalSum += val;
      vocalBins++;
    }
  }
  
  const vocalEnergy = vocalBins > 0 ? (vocalSum / vocalBins) : 0;
  
  // Adaptive baseline noise floor:
  // When NOT recording, smoothly track background audio (Roblox music, ambient sounds)
  if (!isRecording) {
    baselineNoiseFloor = baselineNoiseFloor * 0.96 + vocalEnergy * 0.04;
    if (baselineNoiseFloor < 6) baselineNoiseFloor = 6;
    if (baselineNoiseFloor > 60) baselineNoiseFloor = 60;
  }
  
  // Calculate spectral concentration (pure tones like bells/beeps have high concentration)
  const concentration = totalSum > 0 ? (maxVal / totalSum) : 0;
  if (concentration > 0.24) {
    if (!isRecording && voiceSustainedTimer) {
      clearTimeout(voiceSustainedTimer);
      voiceSustainedTimer = null;
      updateStatus("Listening for sound...", 'listening');
    }
    requestAnimationFrame(monitorVolume);
    return;
  }

  // Voice threshold dynamically adapts above the current background noise floor
  const voiceTriggerThreshold = Math.max(14, baselineNoiseFloor + 8);
  const voiceSustainThreshold = Math.max(8, baselineNoiseFloor + 2.0);

  const isVoiceActive = vocalEnergy > (isRecording ? voiceSustainThreshold : voiceTriggerThreshold);

  if (isVoiceActive) {
    // Human voice detected! Clear silence timer if it was running
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (!isRecording) {
      // Debounce transient noises: voice must be sustained for 240ms to trigger
      if (!voiceSustainedTimer) {
        voiceSustainedTimer = setTimeout(() => {
          startRecording();
          voiceSustainedTimer = null;
        }, 240);
      }
      updateStatus("Voice detected...", 'listening');
    } else {
      updateStatus("Listening to question...", 'listening');
    }
  } else {
    // Sound fell back to ambient baseline
    if (!isRecording && voiceSustainedTimer) {
      clearTimeout(voiceSustainedTimer);
      voiceSustainedTimer = null;
      updateStatus("Listening for sound...", 'listening');
    }

    // If recording is active and voice stopped, start the silence turnaround timer
    if (isRecording && !silenceTimer) {
      updateStatus("Processing question...", 'listening');
      silenceTimer = setTimeout(() => {
        stopRecording();
      }, SILENCE_DURATION);
    }
  }
  
  requestAnimationFrame(monitorVolume);
}

// Start active recording block
function startRecording() {
  if (isRecording) return;
  isRecording = true;
  recordingStartTime = Date.now();
  recordedChunks = [];
  updateStatus("Listening to question...", 'listening');
  
  // Hard ceiling: An interview question should never exceed MAX_RECORDING_DURATION (60s)
  if (maxRecordingTimer) clearTimeout(maxRecordingTimer);
  maxRecordingTimer = setTimeout(() => {
    if (isRecording) {
      console.log("Max question duration reached (60s cap). Automatically finalizing audio.");
      stopRecording();
    }
  }, MAX_RECORDING_DURATION);

  try {
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioDuration = Date.now() - recordingStartTime;
      // If the audio was shorter than 800ms, it was likely an accidental click or cough
      if (audioDuration < MIN_RECORDING_DURATION) {
        console.log(`Audio chunk too short (${audioDuration}ms). Ignored.`);
        return;
      }
      const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
      processAudioAndQueryGemini(audioBlob);
    };
    
    mediaRecorder.start();
  } catch (err) {
    console.error("Failed to start MediaRecorder:", err);
    isRecording = false;
    if (maxRecordingTimer) {
      clearTimeout(maxRecordingTimer);
      maxRecordingTimer = null;
    }
  }
}

// Stop active recording block
function stopRecording() {
  isRecording = false;
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  if (maxRecordingTimer) {
    clearTimeout(maxRecordingTimer);
    maxRecordingTimer = null;
  }
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// Evaluates Groq Whisper verbose_json quality metrics to drop music/silence hallucinations
function evaluateWhisperTranscription(transData) {
  if (!transData || typeof transData !== 'object') {
    return { text: '', dropReason: 'noise' };
  }
  const text = String(transData.text || '').trim();
  if (!text) {
    return { text: '', dropReason: 'noise' };
  }

  const segments = Array.isArray(transData.segments)
    ? transData.segments.filter(s => s && String(s.text || '').trim())
    : [];

  if (segments.length > 0) {
    const ragEngine = getRagEngine();
    const hasTechOrQuestion = ragEngine && ragEngine.hasTechnicalOrQuestionSignal
      ? ragEngine.hasTechnicalOrQuestionSignal(text)
      : false;

    const allSevereNoSpeech = segments.every(
      s => typeof s.no_speech_prob === 'number' && s.no_speech_prob >= 0.85
    );
    const allLikelyNoSpeech = segments.every(
      s => typeof s.no_speech_prob === 'number' && s.no_speech_prob >= 0.72
    );
    const allLowConfNonSpeech = segments.every(
      s => typeof s.avg_logprob === 'number' && typeof s.no_speech_prob === 'number'
        && s.avg_logprob <= -1.15 && s.no_speech_prob >= 0.45
    );
    const wordCount = text.split(/\s+/).filter(Boolean).length;
    const allRepetitionLoop = wordCount >= 4 && segments.every(
      s => typeof s.compression_ratio === 'number' && s.compression_ratio >= 2.45
    );

    if (allSevereNoSpeech || allRepetitionLoop || (!hasTechOrQuestion && (allLikelyNoSpeech || allLowConfNonSpeech))) {
      return { text, dropReason: 'noise' };
    }
  }

  return { text, dropReason: null };
}

// Classifies unwanted system-audio pickups (music, SFX, Whisper hallucinations, exclamations, non-question chatter)
function classifyUnwantedPickup(text, options = {}) {
  if (!text) return { unwanted: true, reasonType: 'noise', cleanText: '' };
  const clean = String(text).trim();
  const lower = clean.toLowerCase();
  const cleanLower = lower.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?'"!]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = cleanLower ? cleanLower.split(/\s+/).filter(Boolean) : [];
  const clarifyActive = Boolean(options && options.clarifyActive);
  const hasHistory = Boolean(options && options.hasHistory);
  const ragEngine = getRagEngine();

  const isExplicitGreeting = clean.length >= 5 && ragEngine && ragEngine.isGreetingOrSmallTalk
    && ragEngine.isGreetingOrSmallTalk(clean);
  const hasTechOrQuestion = ragEngine && ragEngine.hasTechnicalOrQuestionSignal
    ? ragEngine.hasTechnicalOrQuestionSignal(clean)
    : /\?|\b(api|redis|sql|go|python|java|code|algorithm|design|architect|function|how|why|what|explain|describe)\b/i.test(clean);
  const isInterviewControlCue = ragEngine && (
    (ragEngine.isClarifyPromptCue && ragEngine.isClarifyPromptCue(clean)) ||
    (ragEngine.isGoAheadCue && ragEngine.isGoAheadCue(clean)) ||
    (ragEngine.isFeedbackAck && ragEngine.isFeedbackAck(clean, hasHistory))
  );

  // 1. Music tags or music note symbols (e.g. "[Music]", "[Applause]", "♪")
  if (/^(\[.*\]|\(.*\)|[♪♫\s\W])+$|^(\[.*(music|applause|laughter|cheer|chime|sound|noise|cough|sigh|instrumental|silence).*\]|\(.*\)|[♪♫\s]+)+$/i.test(clean) || /[♪♫]/.test(clean)) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // 2. Cyrillic letters (Whisper foreign subtitle/credit hallucination loops)
  if (/[а-яА-Я]/g.test(clean)) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // 3. Explicit unambiguous sound effects vs short ambiguous SFX ("ring", "click", "ping", "tick")
  if (!hasTechOrQuestion && /\b(beep|beeps|ding|dings|chime|chimes|buzzer|oops|oof|sound effects?|applause|cheering)\b/i.test(lower)) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }
  if (!hasTechOrQuestion && words.length <= 4 && /\b(ring|ringing|bell|bells|buzz|ping|pings|click|clicks|tick|ticking)\b/i.test(lower)) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // 4. Known Whisper hallucinations on silence / ambient tracks
  const hallucinations = new Set([
    'thank you', 'thanks', 'thank you very much', 'thank you so much', 'thanks very much', 'thanks so much', 'thanks a lot',
    'you', 'thank you for watching', 'thanks for watching', 'thank you for listening', 'thanks for listening',
    'bye', 'bye bye', 'goodbye', 'see you', 'see you later', 'see you next time',
    'go ahead', 'subtitle by', 'subtitles by', 'transcribed by', 'please subscribe', 'like and subscribe',
    'subscribe to my channel', 'so', 'yeah', 'yes', 'no', 'okay', 'ok', 'oh', 'ah', 'um', 'uh', 'hmm', 'mhm', 'uh huh', 'right', 'alright', 'all right'
  ]);
  const validClarifySingleWord = /^(yes|no|yeah|yep|nope|sure|both|either|neither|ascending|descending|true|false|nullable|empty|utc|bfs|dfs|async|sync|in-place|sorted|unique|duplicates?)$/i;
  if (clarifyActive && words.length === 1 && validClarifySingleWord.test(words[0])) {
    return { unwanted: false, reasonType: null, cleanText: clean };
  }
  if (hallucinations.has(cleanLower) || /\b(?:thanks?\s+for\s+watching|please\s+subscribe|like\s+and\s+subscribe|subtitles?\s+by|amara\.org)\b/i.test(cleanLower)) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // 5. Pure sound repetition (e.g. "la la la" or "ha ha ha")
  const uniqueWords = new Set(words);
  if (words.length >= 4 && uniqueWords.size <= 2) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // 6. Too short to be any spoken prompt (under 4 chars or under 2 words)
  if (cleanLower.length < 4 || words.length < 2) {
    return { unwanted: true, reasonType: 'noise', cleanText: clean };
  }

  // Keep genuine greetings, interviewer control cues, and technical/question utterances
  if (isExplicitGreeting || isInterviewControlCue || hasTechOrQuestion) {
    return { unwanted: false, reasonType: null, cleanText: clean };
  }

  // 7. Ambient exclamations / pure gratitude chatter (e.g. "Oh, my God. Thank you.")
  if (
    words.length <= 10 &&
    /^(?:(?:oh\s+my\s+god|oh\s+gosh|oh\s+wow|oh\s+man|holy\s+cow|goodness|thank\s+goodness|thank\s+god|thank\s+you(?:\s+(?:so\s+much|very\s+much|again))?|thanks(?:\s+(?:a\s+lot|so\s+much|again))?|wow|whoa|jeez|man|dude|alright|okay|yeah|so)\b\s*)+$/i.test(cleanLower)
  ) {
    return { unwanted: true, reasonType: 'non_question', cleanText: clean };
  }

  // 8. Pure self-narrated transition, pause, or waiting remarks with no actual question
  const normalizedChatter = lower.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?!"]+/g, ' ').replace(/\s+/g, ' ').trim();
  const nonQuestionChatter = [
    /^(?:(?:okay|alright|right|so|well|now|yeah|um|uh|let\s+me\s+see)\b\s*)*(?:(?:i(?:'m|\s+am)|we(?:'re|\s+are)|let(?:'s|\s+us))\s+)?(?:(?:going\s+to\s+(?:go|move|skip|jump)\s+(?:on\s+)?to|moving\s+(?:on\s+)?to|switching\s+to|go\s+to)\s+(?:the\s+)?next\s+(?:one|question|problem|slide|part)|go\s+ahead\s+to\s+the\s+next\s+(?:one|question|problem))(?:\s+(?:please|now|here))?$/i,
    /^(?:(?:okay|alright|so|yeah|um|uh|let\s+me\s+see)\b\s*)*(?:(?:hold\s+on(?:\s+a\s+(?:sec|second|minute|moment))?|hang\s+on(?:\s+a\s+(?:sec|second|minute|moment))?|wait(?:\s+a\s+(?:sec|second|minute|moment))?|give\s+me\s+(?:a|one)\s+(?:sec|second|minute|moment)|one\s+(?:sec|second|moment|minute)|bear\s+with\s+me|sorry\s+about\s+that|let\s+me\s+(?:check|pull\s+(?:that|this|it)\s+up|find\s+(?:that|the\s+next\s+one|it)|share\s+my\s+screen|unmute)|i(?:'m|\s+am)\s+going\s+to\s+(?:go\s+ahead\s+and\s+)?(?:get|take)\s+(?:a\s+)?(?:little\s+bit\s+of\s+a\s+)?break|let(?:'s|\s+us)\s+take\s+a\s+break|i(?:'m|\s+am)\s+going\s+to\s+(?:go\s+ahead\s+and\s+)?get\s+it)(?:\s+(?:please|for\s+a\s+(?:sec|second|moment|minute)))?\b\s*)+$/i
  ];
  for (const regex of nonQuestionChatter) {
    if (regex.test(normalizedChatter)) {
      return { unwanted: true, reasonType: 'non_question', cleanText: clean };
    }
  }

  return { unwanted: false, reasonType: null, cleanText: clean };
}

// Validates that the audio is genuine spoken speech and not game noises, beeps, music, or fillers
function isUnwantedNoiseOrFiller(text, options = {}) {
  return classifyUnwantedPickup(text, options).unwanted;
}

// Send Audio to Groq API (Whisper for STT, shared executeInterviewQuery for completions)
async function processAudioAndQueryGemini(audioBlob) {
  removeListeningIndicator();

  // Abort any active query before starting a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  isProcessingResponse = true;
  updateStatus("Analyzing audio...", 'thinking');

  let replyBubble = null;
  let labelDiv = null;

  try {
    let transcribedText = '';
    let whisperDropReason = null;
    let sttDone = false;

    while (!sttDone) {
      if (GEMINI_API_KEYS.length === 0) {
        await loadSystemInstructions();
      }
      const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
      const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';

      if (!currentKey) {
        break;
      }

      try {
        // 1. Fetch Audio Transcription using Whisper (with verbose_json segments to detect non-speech/music)
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'en');
        formData.append('temperature', '0');
        formData.append('response_format', 'verbose_json');

        const transResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentKey}`
          },
          body: formData,
          signal: activeAbortController.signal
        });

        if (!transResponse.ok) {
          const errText = await transResponse.text();
          const failStatus = transResponse.status === 429 ? 'rate-limited' : 'invalid';
          ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

          if ((transResponse.status === 429 || transResponse.status === 400) && rotateApiKey(labelDiv)) {
            continue;
          }
          throw new Error(`Whisper Transcription HTTP ${transResponse.status}: ${errText}`);
        }

        const transData = await transResponse.json();
        const evaluated = evaluateWhisperTranscription(transData);
        transcribedText = evaluated.text;
        whisperDropReason = evaluated.dropReason;
        sttDone = true;
      } catch (sttErr) {
        if (sttErr.name === 'AbortError') {
          console.log("Audio transcription aborted.");
          return;
        }
        const failStatus = (sttErr.message.includes("429") || sttErr.message.includes("tokens per minute"))
          ? 'rate-limited'
          : (sttErr.message.includes("401") ? 'invalid' : 'healthy');
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if (rotateApiKey(labelDiv)) {
          continue;
        }
        throw sttErr;
      }
    }

    if (!sttDone) {
      return;
    }

    if (whisperDropReason) {
      console.log(`[Audio Filter] Discarded Whisper ${whisperDropReason}: "${transcribedText}"`);
      showIgnoredPickupNotice(whisperDropReason, transcribedText);
      return;
    }

    if (!transcribedText) {
      showIgnoredPickupNotice('noise', '');
      return;
    }

    // 2. Validate that the transcribed text is genuine speech and not beeps, bells, music, exclamations, or non-question chatter
    const pickupCheck = classifyUnwantedPickup(transcribedText, {
      clarifyActive: clarifyState.clarifyActive,
      hasHistory: apiMessages.length > 0
    });
    if (pickupCheck.unwanted) {
      console.log(`[Noise Filter] Discarded ${pickupCheck.reasonType}: "${transcribedText}"`);
      showIgnoredPickupNotice(pickupCheck.reasonType, transcribedText);
      return;
    }

    // 3. Genuine Spoken Question Validated! NOW append messages to the chat DOM
    const userMsg = appendMessage(transcribedText, 'user', 'Interviewer Question');
    const aiMsg = appendMessage("Thinking...", 'ai', getActiveKeyLabel());
    replyBubble = aiMsg.msgDiv;
    labelDiv = aiMsg.labelDiv;
    scrollToBottom();

    // 4. Delegate response orchestration to shared interview turn runner
    updateStatus("Analyzing response...", 'thinking');
    await executeInterviewQuery(transcribedText, replyBubble, labelDiv, { fromAudio: true });
    if (replyBubble && replyBubble.dataset && replyBubble.dataset.ignoredPickup === 'true') {
      if (userMsg && userMsg.groupDiv && typeof userMsg.groupDiv.remove === 'function') {
        userMsg.groupDiv.remove();
      }
      if (aiMsg && aiMsg.groupDiv && typeof aiMsg.groupDiv.remove === 'function') {
        aiMsg.groupDiv.remove();
      }
      showIgnoredPickupNotice('non_question', transcribedText);
    }
  } catch (outerErr) {
    console.error("Unhandled error in processAudioAndQueryGemini:", outerErr);
    if (replyBubble && replyBubble.innerText === "Thinking...") {
      replyBubble.innerText = "Error: " + outerErr.message;
    }
  } finally {
    isProcessingResponse = false;
    updateStatus("Listening for sound...", 'listening');
    showListeningIndicator();
    scrollToBottom();
  }
}

// Play / Pause Audio Listening Toggle
function setAudioListeningPaused(paused) {
  isMuted = Boolean(paused);
  if (playbackToggleIcon) {
    playbackToggleIcon.src = isMuted ? '../../assets/icons/play.png' : '../../assets/icons/pause.png';
    playbackToggleIcon.alt = isMuted ? 'play' : 'pause';
  }
  if (playbackToggleBtn) {
    playbackToggleBtn.title = isMuted ? 'Resume AI Listening' : 'Pause AI Listening';
  }
  if (audioWaveGif) {
    audioWaveGif.src = isMuted ? '../../assets/icons/session.pause.png' : '../../assets/icons/session.play.png';
    audioWaveGif.style.opacity = '0.85';
  }
  if (isMuted) {
    updateStatus("AI is paused...", 'muted');
    if (isRecording) {
      stopRecording();
    }
  } else {
    updateStatus("Listening for sound...", 'listening');
  }
  showListeningIndicator();
}

if (playbackToggleBtn) {
  playbackToggleBtn.addEventListener('click', () => {
    setAudioListeningPaused(!isMuted);
  });
}

// Drag Resizing Logic for Chat Panel (Adjust limits here!)
const MIN_PANEL_WIDTH = 272;   // Minimum width allowed (matches control bar width)
const MAX_PANEL_WIDTH = 1500;  // Maximum width allowed
const MIN_PANEL_HEIGHT = 180;  // Minimum height allowed
const MAX_PANEL_HEIGHT = 1000;  // Maximum height allowed

let isResizing = false;
let startX, startY;
let startWidth, startHeight;
let resizeRafId = null;

if (resizeHandle) {
  resizeHandle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isResizing = true;
    startX = e.screenX;
    startY = e.screenY;
    
    const rect = chatPanel.getBoundingClientRect();
    startWidth = rect.width;
    startHeight = rect.height;
    
    // Disable CSS transition during dragging for real-time responsiveness
    chatPanel.style.transition = 'none';
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  });
}

function handleMouseMove(e) {
  if (!isResizing) return;
  
  const dx = e.screenX - startX;
  const dy = e.screenY - startY;
  
  // Calculate new dimensions using configuration constants
  const newWidth = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, startWidth + dx));
  const newHeight = Math.max(MIN_PANEL_HEIGHT, Math.min(MAX_PANEL_HEIGHT, startHeight + dy));
  
  chatPanelWidth = newWidth;
  chatPanelHeight = newHeight;
  
  // Throttling using requestAnimationFrame to eliminate resize lag
  if (!resizeRafId) {
    resizeRafId = requestAnimationFrame(() => {
      // Apply directly to DOM
      chatPanel.style.width = `${chatPanelWidth}px`;
      chatPanel.style.height = `${chatPanelHeight}px`;
      
      // Resize Electron window dynamically to hug the chat panel
      updateWindowSize(false);
      
      if (typeof positionMenuModal === 'function') {
        positionMenuModal();
      }
      
      resizeRafId = null;
    });
  }
}

function handleMouseUp() {
  if (!isResizing) return;
  isResizing = false;
  
  if (resizeRafId) {
    cancelAnimationFrame(resizeRafId);
    resizeRafId = null;
  }
  
  // Re-enable smooth transition animations
  chatPanel.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
  
  updateWindowSize(false);
  
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

// Session control-bar menu modal positioning and logic
function positionMenuModal() {
  const smm = sessionMenuModal || document.getElementById('session-menu-modal');
  if (smm && !smm.classList.contains('collapsed-menu')) {
    const cb = controlBar || document.getElementById('control-bar');
    if (cb) {
      const cbRect = cb.getBoundingClientRect();
      const modalWidth = smm.offsetWidth || 250;
      // Center horizontally relative to the window
      const winWidth = window.innerWidth || (cbRect.width > 0 ? cbRect.width : 272);
      const leftPos = Math.max(0, Math.round((winWidth - modalWidth) / 2));
      
      // Align top with the chat panel (which sits at cbRect.bottom + 12px)
      const cp = chatPanel || document.getElementById('chat-panel');
      const topPos = isExpanded && cp && cp.offsetHeight > 0 
        ? Math.round(cp.getBoundingClientRect().top) 
        : Math.round(cbRect.bottom + 12);

      smm.style.left = `${leftPos}px`;
      smm.style.top = `${topPos}px`;
    }
  }
}

if (menuBtn && sessionMenuModal) {
  const sessionModelOptions = document.getElementById('session-model-options');
  const sessionModelArrow = document.getElementById('session-model-arrow');

  menuBtn.addEventListener('click', () => {
    const isClosed = sessionMenuModal.classList.contains('collapsed-menu');
    if (isClosed) {
      sessionMenuModal.classList.remove('collapsed-menu');
      if (menuIcon) menuIcon.style.transform = 'rotate(90deg)';
      positionMenuModal();
      updateWindowSize(false);
    } else {
      sessionMenuModal.classList.add('collapsed-menu');
      if (menuIcon) menuIcon.style.transform = 'rotate(0deg)';
      
      // Also close the dropdown options if they were open
      if (sessionModelOptions) {
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
      }
      if (sessionModelArrow) sessionModelArrow.style.transform = '';

      updateWindowSize(false);
    }
  });

  // Model Switcher Dropdown and Save/Delete Button Logic
  const sessionModelDropdown = document.getElementById('session-model-dropdown');
  const sessionModelValue = document.getElementById('session-model-value');
  const sessionSaveModelBtn = document.getElementById('session-save-model-btn');

  if (sessionModelDropdown && sessionModelOptions) {
    sessionModelDropdown.addEventListener('click', (e) => {
      e.stopPropagation();
      const isHidden = sessionModelOptions.classList.contains('hidden');
      if (isHidden) {
        sessionModelOptions.classList.remove('hidden');
        sessionModelOptions.classList.add('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = 'rotate(180deg)';
        updateWindowSize(false);
      } else {
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';
        updateWindowSize(false);
      }
    });

    document.addEventListener('click', (e) => {
      if (!sessionModelDropdown.contains(e.target) && !sessionModelOptions.contains(e.target)) {
        const wasOpen = !sessionModelOptions.classList.contains('hidden');
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';
        
        if (wasOpen) {
          updateWindowSize(false);
        }
      }
    });

    const optElements = sessionModelOptions.querySelectorAll('.session-option');
    optElements.forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');

        sessionModelValue.setAttribute('data-selected-value', val);
        sessionModelValue.innerText = val;
        sessionModelValue.classList.add('text-white');
        sessionModelValue.classList.remove('text-gray-400');

        updateSessionCheckmarks(val);

        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';

        updateWindowSize(false);

        // Auto-save immediately to database
        const updatedDb = await ipcRenderer.invoke('save-selected-model', val);
        if (updatedDb) {
          MODEL_NAME = val;
        }
      });
    });
  }
}

function updateSessionCheckmarks(selectedModel) {
  const sessionModelOptions = document.getElementById('session-model-options');
  if (!sessionModelOptions) return;
  const optElements = sessionModelOptions.querySelectorAll('.session-option');
  optElements.forEach(opt => {
    const val = opt.getAttribute('data-value');
    const checkIcon = opt.querySelector('.checkmark-icon');
    if (val === selectedModel) {
      if (checkIcon) checkIcon.classList.remove('hidden');
    } else {
      if (checkIcon) checkIcon.classList.add('hidden');
    }
  });
}

async function initSessionModelDropdown() {
  const sessionModelValue = document.getElementById('session-model-value');
  const sessionInvisibleToggle = document.getElementById('session-invisible-toggle');
  const db = await ipcRenderer.invoke('get-db-data');
  const savedModel = db && db.settings && db.settings.selectedModel ? db.settings.selectedModel : "";
  
  if (savedModel && SUPPORTED_MODELS.includes(savedModel)) {
    MODEL_NAME = savedModel;
    if (sessionModelValue) {
      sessionModelValue.setAttribute('data-selected-value', savedModel);
      sessionModelValue.innerText = getFriendlyModelName(savedModel);
      sessionModelValue.classList.add('text-white');
      sessionModelValue.classList.remove('text-gray-400');
    }
    updateSessionCheckmarks(savedModel);
  } else {
    MODEL_NAME = 'openai/gpt-oss-120b';
    if (sessionModelValue) {
      sessionModelValue.setAttribute('data-selected-value', 'openai/gpt-oss-120b');
      sessionModelValue.innerText = 'openai/gpt-oss-120b';
      sessionModelValue.classList.add('text-white');
      sessionModelValue.classList.remove('text-gray-400');
    }
    updateSessionCheckmarks('openai/gpt-oss-120b');
  }

  // Initialize invisible mode toggle state (defaults to true if undefined)
  if (sessionInvisibleToggle) {
    const isInv = db && db.settings && db.settings.invisibleMode !== undefined ? !!db.settings.invisibleMode : true;
    sessionInvisibleToggle.checked = isInv;
  }
}

// Bind session-invisible-toggle events
document.addEventListener('DOMContentLoaded', () => {
  const sessionInvisibleToggle = document.getElementById('session-invisible-toggle');
  if (sessionInvisibleToggle) {
    sessionInvisibleToggle.addEventListener('change', async (e) => {
      const enable = e.target.checked;
      await ipcRenderer.invoke('toggle-invisible-mode', enable);
    });
  }
});

// IPC listener to sync the Invisible Mode checkbox state dynamically
ipcRenderer.on('invisible-mode-changed', (event, { enable }) => {
  const sessionInvisibleToggle = document.getElementById('session-invisible-toggle');
  if (sessionInvisibleToggle) {
    sessionInvisibleToggle.checked = enable;
  }
});

// Reposition modal on window resize and panel expand/collapse
window.addEventListener('resize', positionMenuModal);

// Intercept window resize IPC messages to keep modal in position
ipcRenderer.on('window-resized', positionMenuModal);

// Auto-start capture on app launch
window.addEventListener('DOMContentLoaded', async () => {
  // Set initial dynamic window size for collapsed state
  updateWindowSize(false);
  
  // Initialize the session model switcher
  await initSessionModelDropdown();
  
  updateStatus("Initializing listener...");
  try {
    audioStream = await startSystemAudioCapture();
    initAudioAnalysis(audioStream);
    updateStatus("Listening for sound...", 'listening');
  } catch (err) {
    updateStatus("Error: Screen/audio capture blocked", 'muted');
    console.error("Auto-start capture failed:", err);
  }
});

// PROACTIVE BACKGROUND HEALTH CHECK
async function runProactiveHealthCheck() {
  if (GEMINI_API_KEYS.length <= 1) return; // No backups configured
  const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
  const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';
  if (!currentKey) return;

  try {
    const response = await fetch(`https://api.groq.com/openai/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentKey}`
      },
      body: JSON.stringify({
        model: MODEL_NAME,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1
      })
    });
    if (response.status === 429) {
      console.warn(`Proactive Health Check: Key ${currentType} is rate-limited. Rotating pre-emptively...`);
      ipcRenderer.send('set-key-status', { keyType: currentType, status: 'rate-limited' });
      rotateApiKey();
    }
  } catch (err) {
    console.error("Proactive Health Check failed:", err);
  }
}

// Run health check every 60 seconds if the app is idle
setInterval(() => {
  if (!isProcessingResponse) {
    runProactiveHealthCheck();
  }
}, 60000);
