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

let GEMINI_API_KEYS = [];
let activeKeyIndex = 0;
let MODEL_NAME = 'openai/gpt-oss-120b';
let activeAbortController = null;

// System prompt text holder
let systemInstructionText = "";
let sessionHistory = [];
let apiMessages = [];

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

async function loadSystemInstructions() {
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

      // Load Resume
      let resumeText = "";
      if (db.settings.resume && db.settings.resume.content) {
        resumeText = db.settings.resume.content;
      }

      // Load Contexts
      let contextText = "";
      if (db.settings.contexts && db.settings.contexts.length > 0) {
        db.settings.contexts.forEach(c => {
          contextText += `\n\n=== Context: ${c.fileName} ===\n${c.content}`;
        });
      }

      systemInstructionText = `# SYSTEM PROTOCOL (YOUR PERSONA AND BEHAVIORS)

## CRITICAL INSTRUCTIONS (MUST OBEY AT ALL TIMES):
1. **IDENTITY & SECRECY**: You ARE the user representing a real software engineer in an interview. Speak strictly in the first person ("I", "my", "our"). Never refer to yourself as an AI, chatbot, assistant, or large language model. Never mention GoCheet, Gemini, OpenAI, or any AI services. If asked about using AI or cheating, stay completely silent.
2. **BREVITY & FOCUS**: Keep all responses extremely short, direct, and conversational (3-5 sentences maximum). Answer only what is asked, without unnecessary pleasantries or conversational padding. Do NOT use bullet points unless specifically requested or listing sequential algorithm steps. Do NOT output raw ASCII art, pipe dividers (\`|\`), equals line dividers (\`=\`), plus signs (\`+\`), or dashes (\`-\`) as text dividers or table borders.
3. **TONE**: Speak politely and naturally, keeping a casual yet professional tone. Use everyday language and casual transition phrases (e.g. "So basically...", "What I did was...", "At my last job..."). Avoid formal, textbook-like jargon.
4. **LIST LIMIT**: When listing points or steps, limit lists strictly to **2 to 3 key strategic points maximum** for readability. Ensure each point is concise and makes clear impact.
5. **READABILITY & BOLDING**: Use bolding (\\*\`**text**\`\\*) very sparsely. ONLY bold key technical terms (e.g. algorithm names, time/space complexities). Never bold random verbs, adjectives, or entire sentences. Put spacing between paragraphs.
6. **BIG O PRONUNCIATION (MANDATORY)**: Whenever you output any Time or Space Complexity notation (e.g. O(1), O(n), O(log n), O(n log n), O(n^2), O(2^n)), you MUST always format it with a dash and its pronunciation & representation in parenthesis immediately after it.
   - Time Complexity Examples:
     * O(1) - (pronounced as "Big O of 1", representing Constant Time Complexity)
     * O(n) - (pronounced as "Big O of n", representing Linear Time Complexity)
     * O(log n) - (pronounced as "Big O of log n", representing Logarithmic Time Complexity)
     * O(n log n) - (pronounced as "Big O of n log n", representing Linearithmic Time Complexity)
     * O(n^2) - (pronounced as "Big O of n squared", representing Quadratic Time Complexity)
     * O(2^n) - (pronounced as "Big O of 2 to the n", representing Exponential Time Complexity)
   - Space Complexity Examples:
     * O(1) - (pronounced as "Big O of 1", representing Constant Space Complexity)
     * O(n) - (pronounced as "Big O of n", representing Linear Space Complexity)
7. **CONCEPTUAL & TECHNICAL QUESTIONS**: If the question is conceptual/architectural (e.g. "explain CSR vs SSR", "what is HTTP GET vs POST", "explain REST"), answer strictly with text in under 4 sentences. Do NOT write a code block. At the end of your explanation, output exactly one short, natural clarifying follow-up question to ask the interviewer (e.g., "For our setup, are we prioritizing initial page load speed or user interaction?").
8. **COLLABORATIVE LIVE CODING FLOW**:
   * Writing perfect code instantly is highly suspicious.
   * When a coding problem is first introduced (e.g. "reverse a linked list", "implement two sum"), DO NOT write the code block yet.
   * Instead, your first response must propose **1 or 2 clarifying questions** to ask the interviewer (e.g. asking about constraints like duplicates, sorting, negative values) and provide a quick **Brute Force vs. Optimal** complexity comparison (using the plain-English notation and pronunciation rules).
   * Only write and output the code block format (intro line, code block, output, ending explanation) if the interviewer has answered your questions or if the user's question explicitly asks to write/implement the code directly (e.g. "code me...", "write the function...", "implement...").
9. **CODE BLOCK FORMAT (WHEN CODING IS REQUESTED)**:
   * **Line 1 (Short Start Description)**: Start with exactly one short sentence introducing the solution code (e.g., "Here is the Python implementation using a Hash Map:").
   * **Line 2 (Code Block Container)**: Output the code block. The code block must contain sparse, helpful comments explaining key logic. The code block MUST ONLY contain the solution code itself—do NOT write driver code, print calls, function example execution calls, or outputs inside the code block container.
   * **Line 3 (Code Output)**: Immediately below the code block (outside the code block container), output the sample execution result/output as plain text (e.g., Output: [result]).
   * **Line 4 (Trace Table & Short Explanation Ending)**: Output a step-by-step **Dry-Run Trace Table** tracking variables for a sample input, followed by a brief 1-2 sentence ending explanation of the approach and complexities (using the plain-English Big O rules).
10. **BUG DEBUGGER MODE**: If the user sends an error trace or bug description (e.g. "IndexError", "failing test case"), enter Debugger Mode: do NOT rewrite the entire function. Instead, explain the bug in 1 sentence and output a simple **1-line code diff fix**, followed by a brief explanation.
11. **NO REDUNDANT CODE**: Do not write redundant helper classes (like node classes for linked lists/trees) unless asked. Only write the main solution function.
12. **LANGUAGE MATCHING**: Match the programming language on the user's screen or requested by the interviewer. If not specified, default to Python.

## IDENTITY (YOU ARE THIS PERSON):
${resumeText}

## ADDITIONAL DEV CONTEXT (FACTS ABOUT YOUR WORK/STYLE):
${contextText}
`;
    }
  } catch (err) {
    console.error("Failed to load instructions from local database:", err);
  }
}

// Load rules and persona context on app launch
loadSystemInstructions();

function formatMarkdown(text) {
  if (!text) return "";
  
  // Split by ``` to find code blocks (even indices are markdown text, odd indices are code blocks)
  const parts = text.split("```");
  let html = "";
  
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      let textPart = parts[i];
      // Consolidate three or more consecutive newlines to exactly two newlines
      textPart = textPart.replace(/\n{3,}/g, '\n\n');
      
      // Escape HTML entities to prevent XSS
      let escapedText = textPart
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
        
      // Parse inline elements (code, bold, headings, lists)
      escapedText = escapedText
        .replace(/`([^`]+)`/g, '<strong class="font-semibold text-white">$1</strong>')
        .replace(/\*\*([^\*]+)\*\*/g, '<strong class="font-semibold text-white">$1</strong>')
        .replace(/^### (.*$)/gim, '<h3 class="text-xs font-semibold text-white mt-3 mb-1">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-sm font-bold text-white mt-4 mb-2">$1</h2>')
        .replace(/^# (.*$)/gim, '<h1 class="text-base font-black text-white mt-5 mb-2">$1</h1>')
        .replace(/^\s*[-*]\s+(.*$)/gim, '<li class="ml-4 list-disc text-xs text-gray-300">$1</li>')
        .replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div class="ml-4 text-sm text-gray-300 my-1" style="margin: 6px 0 !important; font-size: 14px !important;"><strong class="text-white">$1.</strong> $2</div>');
        
      // Natural spacing: treat double newlines as paragraph breaks, single newlines as spaces,
      // and remove trailing newlines after block elements to prevent double-spacing
      escapedText = escapedText.replace(/(<\/h\d>|<\/li>|<\/div>)\s*\n/gi, '$1');
      escapedText = escapedText.replace(/\n{2,}/g, '<br><br>');
      escapedText = escapedText.replace(/\n/g, ' ');
        
      html += escapedText;
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

      const uniqueId = 'code-' + Math.random().toString(36).substr(2, 9);
      let highlightedCode = cleanCode;
      const grammar = Prism.languages[lang] || Prism.languages.python || Prism.languages.clike;
      try {
        highlightedCode = Prism.highlight(cleanCode, grammar, lang);
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
        <pre class="p-3 overflow-x-auto"><code id="${uniqueId}" class="language-${lang}">${highlightedCode}</code></pre>
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

// App configuration
const VOLUME_THRESHOLD = 5;     // Sound level threshold (out of 255)
const SILENCE_DURATION = 900;    // 0.9 seconds of silence before stopping recording

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
let isExpanded = false;
let chatPanelWidth = 680;
let chatPanelHeight = 260;

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
          }]
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

  ipcRenderer.send('end-session', { duration, title: aiTitle });
});

// Esc key to minimize
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ipcRenderer.send('minimize-window');
  }
});

expandToggleBtn.addEventListener('click', () => {
  isExpanded = !isExpanded;
  const winWidth = Math.max(chatPanelWidth + 40, 800);
  const isMenuOpen = sessionMenuModal && !sessionMenuModal.classList.contains('hidden');

  if (isExpanded) {
    chatPanel.classList.remove('collapsed-panel');
    chevronIcon.style.transform = 'rotate(180deg)';
    
    // Restore custom dimensions of chat panel
    chatPanel.style.width = `${chatPanelWidth}px`;
    chatPanel.style.height = `${chatPanelHeight}px`;
    
    // Resize Electron window to fit expanded layout
    ipcRenderer.send('resize-window', { width: winWidth, height: chatPanelHeight + 120 });
  } else {
    chatPanel.classList.add('collapsed-panel');
    chevronIcon.style.transform = 'rotate(0deg)';
    
    // Wait for the CSS transition (300ms) to finish before shrinking the Electron window height
    setTimeout(() => {
      if (!isExpanded) {
        const currentIsMenuOpen = sessionMenuModal && !sessionMenuModal.classList.contains('hidden');
        const winHeight = currentIsMenuOpen ? 120 : 68;
        ipcRenderer.send('resize-window', { width: winWidth, height: winHeight });
      }
    }, 300);
  }

  // Reposition the menu modal dynamically after layouts render
  setTimeout(() => {
    if (typeof positionMenuModal === 'function') positionMenuModal();
  }, 50);
});

// Enable/Disable send button based on input
chatInput.addEventListener('input', () => {
  if (chatInput.value.trim() !== '') {
    sendBtn.removeAttribute('disabled');
  } else {
    sendBtn.setAttribute('disabled', 'true');
  }
});

// Send message on Enter
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && chatInput.value.trim() !== '') {
    sendMessage();
  }
});

sendBtn.addEventListener('click', () => {
  if (chatInput.value.trim() !== '') {
    sendMessage();
  }
});

function sendMessage() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  sendBtn.setAttribute('disabled', 'true');

  sendTextMessage(text);
}

function appendMessage(text, sender, label = "") {
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
  } else {
    msgDiv.innerText = text;
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

// Read Groq SSE stream and output chunks directly into a message bubble in real-time
async function streamResponse(response, replyBubble) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let hasContent = false;
  
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
        if (!cleanLine) continue;
        if (cleanLine.startsWith("data: ")) {
          const jsonStr = cleanLine.substring(6).trim();
          if (jsonStr === "[DONE]") continue;
          try {
            const data = JSON.parse(jsonStr);
            if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
              const textChunk = data.choices[0].delta.content;
              if (textChunk) {
                if (!hasContent) {
                  replyBubble.innerHTML = "";
                  replyBubble.dataset.rawText = "";
                  hasContent = true;
                }
                replyBubble.dataset.rawText += textChunk;
                replyBubble.innerHTML = formatMarkdown(replyBubble.dataset.rawText);
                scrollToBottom();
              }
            }
          } catch (e) {
            // Wait for next buffer data
          }
        }
      }
    }
  } catch (error) {
    console.error("Stream reader loop error:", error);
    replyBubble.innerText += "\n[Error streaming: " + error.message + "]";
  }
  
  if (!hasContent) {
    replyBubble.innerText = "Sorry, I could not generate a response.";
  }
}

// Obsolete for Groq - wrapper to redirect
async function streamAudioResponse(response, statusIndicator, replyBubble) {
  await streamResponse(response, replyBubble);
}

function showListeningIndicator() {
  if (document.getElementById('listening-indicator')) return;
  
  const groupDiv = document.createElement('div');
  groupDiv.id = 'listening-indicator';
  groupDiv.classList.add('flex', 'flex-col', 'w-full', 'items-start');
  
  const labelDiv = document.createElement('div');
  labelDiv.classList.add('message-label', 'mb-1', 'select-none');
  labelDiv.innerText = 'AI Status';
  groupDiv.appendChild(labelDiv);
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', 'ai');
  msgDiv.innerText = 'AI is listening right now...';
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

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

// Update UI Status (Visual state of mic and gif)
function updateStatus(text, stateClass = '') {
  if (statusText) statusText.innerText = text;
  
  // Update mic button style and wave gif opacity based on state
  if (listenBtn) {
    listenBtn.className = 'w-6 h-6 rounded-full bg-theme-btn flex items-center justify-center hover:opacity-80 transition-opacity';
    if (isMuted) {
      listenBtn.classList.add('muted');
      if (audioWaveGif) audioWaveGif.style.opacity = '0.25';
      return;
    }
    
    if (stateClass) {
      listenBtn.classList.add(stateClass);
    }
  }

  // Manage gif opacity/pulse
  if (audioWaveGif) {
    if (stateClass === 'listening') {
      audioWaveGif.style.opacity = '0.9';
    } else if (stateClass === 'thinking') {
      audioWaveGif.style.opacity = '0.4';
    } else {
      audioWaveGif.style.opacity = '0.8';
    }
  }
}

// Groq Text Query
async function sendTextMessage(text) {
  removeListeningIndicator();
  
  // Abort any active query before starting a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  const { msgDiv: userBubble } = appendMessage(text, 'user', 'Me');
  const { msgDiv: replyBubble, labelDiv } = appendMessage("Thinking...", 'ai', getActiveKeyLabel());
  scrollToBottom();
  
  isProcessingResponse = true;
  updateStatus("Thinking...", 'thinking');
  
  let success = false;
  while (!success) {
    const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
    const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';

    if (!currentKey) {
      replyBubble.innerText = "Error: No API Key available. Please configure keys in Settings.";
      break;
    }

    try {
      await loadSystemInstructions();
      const url = `https://api.groq.com/openai/v1/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: systemInstructionText },
            ...apiMessages,
            { role: 'user', content: text }
          ],
          stream: true
        }),
        signal: activeAbortController.signal
      });
      
      if (!response.ok) {
        const errText = await response.text();
        const failStatus = response.status === 429 ? 'rate-limited' : 'invalid';
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if ((response.status === 429 || response.status === 400) && rotateApiKey(labelDiv)) {
          continue; // Retry loop with next key
        }
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      
      await streamResponse(response, replyBubble);
      sessionHistory.push(`User: ${text}`);
      sessionHistory.push(`AI: ${replyBubble.dataset.rawText || replyBubble.innerText}`);
      apiMessages.push({ role: 'user', content: text });
      apiMessages.push({ role: 'assistant', content: replyBubble.dataset.rawText || replyBubble.innerText });
      
      ipcRenderer.send('set-key-status', { keyType: currentType, status: 'healthy' });
      ipcRenderer.send('increment-api-usage', { keyType: currentType });
      success = true;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("Request aborted.");
        if (replyBubble) replyBubble.innerText = "[Interrupted]";
        break;
      }

      const failStatus = error.message.includes("429") ? 'rate-limited' : 'invalid';
      ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

      if (rotateApiKey(labelDiv)) {
        continue; // Retry loop with next key
      }
      if (replyBubble) {
        if (error.message.includes("429")) {
          replyBubble.innerText = "⚠️ Groq API Rate Limit Exceeded (HTTP 429). All API Keys have reached their limits. Please wait about 1 minute and try again.";
        } else {
          replyBubble.innerText = "Error: " + error.message;
        }
      }
      break; // Exit retry loop
    }
  }

  isProcessingResponse = false;
  updateStatus("Listening for sound...", 'listening');
  showListeningIndicator();
  scrollToBottom();
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

// Web Audio API analysis setup
function initAudioAnalysis(stream) {
  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;
  const bufferLength = analyser.frequencyBinCount;
  dataArray = new Uint8Array(bufferLength);
  
  sourceNode = audioContext.createMediaStreamSource(stream);

  // 1. Highpass filter to cut out low rumbling hums below 80Hz
  const hpFilter = audioContext.createBiquadFilter();
  hpFilter.type = 'highpass';
  hpFilter.frequency.value = 80;

  // 2. Lowpass filter to cut out high notification pings above 3000Hz
  const lpFilter = audioContext.createBiquadFilter();
  lpFilter.type = 'lowpass';
  lpFilter.frequency.value = 3000;

  // Connect stream -> HP filter -> LP filter -> Analyser
  sourceNode.connect(hpFilter);
  hpFilter.connect(lpFilter);
  lpFilter.connect(analyser);
  
  monitorVolume();
}

// Continuous volume monitoring loop
function monitorVolume() {
  if (!analyser || isMuted || isProcessingResponse) {
    requestAnimationFrame(monitorVolume);
    return;
  }
  
  analyser.getByteFrequencyData(dataArray);
  
  let sum = 0;
  let maxVal = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
    if (dataArray[i] > maxVal) {
      maxVal = dataArray[i];
    }
  }
  const averageVolume = sum / dataArray.length;
  
  // Calculate spectral concentration (pure tones like bells/chimes have high concentration)
  const concentration = sum > 0 ? (maxVal / sum) : 0;
  if (concentration > 0.22) {
    // Pure tone detected (notification chime, bell, or bleep), cancel voice trigger
    if (!isRecording && voiceSustainedTimer) {
      clearTimeout(voiceSustainedTimer);
      voiceSustainedTimer = null;
      updateStatus("Listening for sound...", 'listening');
    }
    requestAnimationFrame(monitorVolume);
    return;
  }

  if (averageVolume > VOLUME_THRESHOLD) {
    // Clear silence timer if it was running
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }

    if (!isRecording) {
      // Debounce transient sounds (must stay above threshold for 300ms to trigger)
      if (!voiceSustainedTimer) {
        voiceSustainedTimer = setTimeout(() => {
          startRecording();
          voiceSustainedTimer = null;
        }, 300);
      }
      updateStatus("Sound detected...", 'listening');
    } else {
      updateStatus("Recording sound...", 'listening');
    }
  } else {
    // If volume fell below threshold, cancel any pending recording trigger
    if (!isRecording && voiceSustainedTimer) {
      clearTimeout(voiceSustainedTimer);
      voiceSustainedTimer = null;
      updateStatus("Listening for sound...", 'listening');
    }

    if (isRecording && !silenceTimer) {
      updateStatus("Processing in 1.5s...", 'listening');
      silenceTimer = setTimeout(() => {
        stopRecording();
      }, SILENCE_DURATION);
    }
  }
  
  requestAnimationFrame(monitorVolume);
}

// Start active recording block
function startRecording() {
  isRecording = true;
  recordedChunks = [];
  updateStatus("Recording sound...", 'listening');
  
  try {
    mediaRecorder = new MediaRecorder(audioStream, { mimeType: 'audio/webm' });
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(recordedChunks, { type: 'audio/webm' });
      processAudioAndQueryGemini(audioBlob);
    };
    
    mediaRecorder.start();
  } catch (err) {
    console.error("Failed to start MediaRecorder:", err);
    isRecording = false;
  }
}

// Stop active recording block
function stopRecording() {
  isRecording = false;
  silenceTimer = null;
  
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
}

// Send Audio to Groq API (Whisper for STT, Llama for completions)
async function processAudioAndQueryGemini(audioBlob) {
  removeListeningIndicator();
  
  // Abort any active query before starting a new one
  if (activeAbortController) {
    activeAbortController.abort();
  }
  activeAbortController = new AbortController();

  const { msgDiv: statusIndicator } = appendMessage("[Transcribing audio...]", 'user', 'Interviewer Question');
  const { msgDiv: replyBubble, labelDiv } = appendMessage("Thinking...", 'ai', getActiveKeyLabel());
  scrollToBottom();
  
  isProcessingResponse = true;
  updateStatus("Analyzing audio...", 'thinking');
  
  let success = false;
  while (!success) {
    const currentKey = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].key : '';
    const currentType = GEMINI_API_KEYS[activeKeyIndex] ? GEMINI_API_KEYS[activeKeyIndex].type : 'primary';

    if (!currentKey) {
      if (statusIndicator) statusIndicator.remove();
      replyBubble.innerText = "Error: No API Key available. Please configure keys in Settings.";
      break;
    }

    try {
      // 1. Fetch Audio Transcription using Whisper
      updateStatus("Transcribing audio...", 'thinking');
      const formData = new FormData();
      formData.append('file', audioBlob, 'audio.webm');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('language', 'en'); // Force English output

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
          continue; // Retry loop with next key
        }
        throw new Error(`Whisper Transcription HTTP ${transResponse.status}: ${errText}`);
      }

      const transData = await transResponse.json();
      const transcribedText = (transData.text || "").trim();
      
      if (!transcribedText) {
        // No speech detected
        if (statusIndicator) statusIndicator.parentNode.remove();
        if (replyBubble) replyBubble.parentNode.remove();
        success = true;
        break;
      }

      // WHISPER HALLUCINATION FILTER
      const cleanTextLower = transcribedText.toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "").trim();
      const hallucinations = [
        "thank you",
        "you",
        "продолжение следует",
        "thanks for watching",
        "bye",
        "go ahead",
        "subtitle by"
      ];

      // Check for Cyrillic letters (e.g. Russian credit hallucinations)
      const hasCyrillic = /[а-яА-Я]/g.test(transcribedText);

      if (cleanTextLower.length < 4 || hallucinations.includes(cleanTextLower) || /^[0-9\s]*$/.test(cleanTextLower) || hasCyrillic) {
        console.log(`Discarded Whisper Hallucination/Tone: "${transcribedText}"`);
        if (statusIndicator) statusIndicator.parentNode.remove();
        if (replyBubble) replyBubble.parentNode.remove();
        success = true;
        break;
      }

      // Update user bubble with final transcription
      statusIndicator.innerText = transcribedText;

      // 2. Query Llama 3.3 for the response
      updateStatus("Analyzing response...", 'thinking');
      await loadSystemInstructions();
      const url = `https://api.groq.com/openai/v1/chat/completions`;
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentKey}`
        },
        body: JSON.stringify({
          model: MODEL_NAME,
          messages: [
            { role: 'system', content: systemInstructionText },
            ...apiMessages,
            { role: 'user', content: transcribedText }
          ],
          stream: true
        }),
        signal: activeAbortController.signal
      });

      if (!response.ok) {
        const errText = await response.text();
        const failStatus = response.status === 429 ? 'rate-limited' : 'invalid';
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if ((response.status === 429 || response.status === 400) && rotateApiKey(labelDiv)) {
          continue; // Retry loop with next key
        }
        throw new Error(`Groq Completion HTTP ${response.status}: ${errText}`);
      }
      
      await streamResponse(response, replyBubble);
      sessionHistory.push(`User: ${transcribedText}`);
      sessionHistory.push(`AI: ${replyBubble.dataset.rawText || replyBubble.innerText}`);
      apiMessages.push({ role: 'user', content: transcribedText });
      apiMessages.push({ role: 'assistant', content: replyBubble.dataset.rawText || replyBubble.innerText });
 
      ipcRenderer.send('set-key-status', { keyType: currentType, status: 'healthy' });
      ipcRenderer.send('increment-api-usage', { keyType: currentType });
      success = true;
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log("Request aborted.");
        if (statusIndicator && statusIndicator.innerText === "[Transcribing audio...]") {
          statusIndicator.remove();
        }
        if (replyBubble) replyBubble.innerText = "[Interrupted]";
        break;
      }

      const failStatus = error.message.includes("429") ? 'rate-limited' : 'invalid';
      ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

      if (rotateApiKey(labelDiv)) {
        continue; // Retry loop with next key
      }
      if (statusIndicator && statusIndicator.innerText === "[Transcribing audio...]") {
        statusIndicator.remove();
      }
      if (replyBubble) {
        if (error.message.includes("429")) {
          replyBubble.innerText = "⚠️ Groq API Rate Limit Exceeded (HTTP 429). All API Keys have reached their limits. Please wait about 1 minute and try again.";
        } else {
          replyBubble.innerText = "Error processing audio: " + error.message;
        }
      }
      break; // Exit retry loop
    }
  }

  isProcessingResponse = false;
  updateStatus("Listening for sound...", 'listening');
  showListeningIndicator();
  scrollToBottom();
}

// User toggle to mute/unmute auto-listening
if (listenBtn) {
  listenBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    if (isMuted) {
      updateStatus("Auto-listening paused", 'muted');
      if (isRecording) {
        stopRecording();
      }
    } else {
      updateStatus("Listening for sound...", 'listening');
    }
  });
}

// Drag Resizing Logic for Chat Panel (Adjust limits here!)
const MIN_PANEL_WIDTH = 190;   // Minimum width allowed
const MAX_PANEL_WIDTH = 1500;  // Maximum width allowed
const MIN_PANEL_HEIGHT = 300;  // Minimum height allowed
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
      
      const winWidth = Math.max(chatPanelWidth + 40, 800);

      // Resize Electron window to fit layout instantly (animate: false)
      ipcRenderer.send('resize-window', { 
        width: winWidth, 
        height: chatPanelHeight + 120, 
        animate: false 
      });
      
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
  
  document.removeEventListener('mousemove', handleMouseMove);
  document.removeEventListener('mouseup', handleMouseUp);
}

// Session control-bar menu modal positioning and logic
const menuBtn = document.getElementById('menu-btn');
const sessionMenuModal = document.getElementById('session-menu-modal');

function positionMenuModal() {
  if (sessionMenuModal && !sessionMenuModal.classList.contains('collapsed-menu')) {
    const controlBar = document.getElementById('control-bar');
    if (controlBar) {
      const cbRect = controlBar.getBoundingClientRect();
      sessionMenuModal.style.left = `${cbRect.right + 12}px`;
      sessionMenuModal.style.top = `${cbRect.top}px`;
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
      positionMenuModal();
      
      // If collapsed, expand height to 120px to fit menu modal
      if (!isExpanded) {
        const winWidth = Math.max(chatPanelWidth + 40, 800);
        ipcRenderer.send('resize-window', { width: winWidth, height: 120, animate: false });
      }
    } else {
      sessionMenuModal.classList.add('collapsed-menu');
      
      // Also close the dropdown options if they were open
      if (sessionModelOptions) {
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
      }
      if (sessionModelArrow) sessionModelArrow.style.transform = '';

      // If collapsed, shrink height back to normal 68px
      if (!isExpanded) {
        const winWidth = Math.max(chatPanelWidth + 40, 800);
        ipcRenderer.send('resize-window', { width: winWidth, height: 68, animate: false });
      }
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
        
        // If collapsed, expand height to 260px to prevent clipping the options list
        if (!isExpanded) {
          const winWidth = Math.max(chatPanelWidth + 40, 800);
          ipcRenderer.send('resize-window', { width: winWidth, height: 260, animate: false });
        }
      } else {
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';
        
        // If collapsed, shrink height back to 120px
        if (!isExpanded) {
          const winWidth = Math.max(chatPanelWidth + 40, 800);
          ipcRenderer.send('resize-window', { width: winWidth, height: 120, animate: false });
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!sessionModelDropdown.contains(e.target) && !sessionModelOptions.contains(e.target)) {
        const wasOpen = !sessionModelOptions.classList.contains('hidden');
        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';
        
        // If collapsed and dropdown was open, shrink height back to 120px
        if (wasOpen && !isExpanded) {
          const winWidth = Math.max(chatPanelWidth + 40, 800);
          ipcRenderer.send('resize-window', { width: winWidth, height: 120, animate: false });
        }
      }
    });

    const optElements = sessionModelOptions.querySelectorAll('.session-option');
    optElements.forEach(opt => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const val = opt.getAttribute('data-value');
        const text = opt.innerText;

        sessionModelValue.setAttribute('data-selected-value', val);
        sessionModelValue.innerText = text;
        sessionModelValue.classList.add('text-white');
        sessionModelValue.classList.remove('text-gray-400');

        sessionModelOptions.classList.add('hidden');
        sessionModelOptions.classList.remove('flex');
        if (sessionModelArrow) sessionModelArrow.style.transform = '';

        // If collapsed, shrink height back to 120px
        if (!isExpanded) {
          const winWidth = Math.max(chatPanelWidth + 40, 800);
          ipcRenderer.send('resize-window', { width: winWidth, height: 120, animate: false });
        }

        // Auto-save immediately to database
        const updatedDb = await ipcRenderer.invoke('save-selected-model', val);
        if (updatedDb) {
          MODEL_NAME = val;
        }
      });
    });
  }
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
  } else {
    MODEL_NAME = 'openai/gpt-oss-120b';
    if (sessionModelValue) {
      sessionModelValue.setAttribute('data-selected-value', 'openai/gpt-oss-120b');
      sessionModelValue.innerText = 'openai/gpt-oss-120b';
      sessionModelValue.classList.add('text-white');
      sessionModelValue.classList.remove('text-gray-400');
    }
  }

  // Initialize invisible mode toggle state
  if (sessionInvisibleToggle && db) {
    sessionInvisibleToggle.checked = !!db.settings.invisibleMode;
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
  // Set initial window size for collapsed state
  ipcRenderer.send('resize-window', { width: 800, height: 68 });
  
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
