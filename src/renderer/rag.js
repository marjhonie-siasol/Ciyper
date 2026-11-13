/**
 * rag.js - In-memory local retrieval engine for Ciyper
 * Pure JavaScript, zero external dependencies, runs in ~1-2ms on CPU.
 * Features:
 * - Line-accurate chunking (exact 1-indexed startLine and endLine tracking)
 * - Semantic keyword & synonym scoring with strict whole-word matching
 * - Automatic greeting / small talk bypass (prevents false citations on greetings)
 * - Automatic coding / LeetCode task bypass (lets pure LLM intelligence solve code without fake resume citations)
 * - Multi-turn conversational memory search
 * - Pinpoint source citation metadata for AI response grounding
 */

(function (root, factory) {
  const instance = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = instance;
  }
  if (typeof window !== 'undefined') {
    window.CiyperRAG = instance;
  }
  if (typeof global !== 'undefined') {
    global.CiyperRAG = instance;
  }
  if (root) {
    root.CiyperRAG = instance;
  }
}(typeof self !== 'undefined' ? self : (typeof window !== 'undefined' ? window : this), function () {

  // Common English stop words to filter out of search queries
  const STOP_WORDS = new Set([
    'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
    'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
    'can', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
    'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t', 'have',
    'haven\'t', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i', 'if',
    'in', 'into', 'is', 'isn\'t', 'it', 'its', 'itself', 'just', 'let\'s', 'me', 'more', 'most', 'my', 'myself',
    'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our', 'ours', 'ourselves',
    'out', 'over', 'own', 'same', 'she', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'the',
    'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to',
    'too', 'under', 'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'were', 'weren\'t', 'what', 'when', 'where',
    'which', 'while', 'who', 'whom', 'why', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'your', 'yours',
    'yourself', 'yourselves'
  ]);

  // Concept & Synonym Dictionary for semantic understanding without heavy vector DBs
  const SYNONYM_MAP = {
    'traffic': ['load', 'concurrency', 'requests', 'spikes', 'throughput', 'scale'],
    'spike': ['traffic', 'surge', 'burst', 'load', 'spikes'],
    'spikes': ['traffic', 'surge', 'burst', 'load'],
    'fast': ['speed', 'latency', 'performance', 'throughput', 'quick', 'efficient'],
    'slow': ['latency', 'lag', 'bottleneck', 'delay'],
    'speed': ['latency', 'throughput', 'performance', 'fast'],
    'cache': ['caching', 'redis', 'memcached', 'memory', 'store'],
    'caching': ['cache', 'redis', 'memcached', 'ttl', 'store'],
    'database': ['db', 'sql', 'postgres', 'postgresql', 'mongodb', 'mysql', 'storage', 'queries', 'aurora'],
    'db': ['database', 'sql', 'postgres', 'storage', 'aurora'],
    'queue': ['messaging', 'broker', 'kafka', 'rabbitmq', 'eventmesh', 'pubsub', 'topics'],
    'messaging': ['queue', 'broker', 'kafka', 'rabbitmq', 'eventmesh', 'pubsub'],
    'event': ['events', 'eventmesh', 'messaging', 'broker', 'streaming'],
    'scale': ['scaling', 'distributed', 'cluster', 'horizontal', 'throughput', 'load'],
    'scaling': ['scale', 'distributed', 'cluster', 'sharding', 'replicas'],
    'distributed': ['cluster', 'nodes', 'consensus', 'raft', 'mesh', 'eventmesh'],
    'monitor': ['monitoring', 'metrics', 'observability', 'telemetry', 'prometheus', 'grafana', 'datadog', 'logs'],
    'monitoring': ['monitor', 'metrics', 'observability', 'telemetry', 'prometheus', 'grafana', 'datadog', 'logs'],
    'test': ['testing', 'unit', 'integration', 'e2e', 'coverage'],
    'deploy': ['deployment', 'ci/cd', 'docker', 'kubernetes', 'k8s', 'pipeline', 'eks'],
    'api': ['rest', 'graphql', 'grpc', 'endpoints', 'http'],
    'auth': ['authentication', 'authorization', 'jwt', 'oauth', 'token'],
    'payment': ['ledger', 'financial', 'transactions', 'checkout', 'stripe', 'paypal'],
    'payments': ['ledger', 'financial', 'transactions', 'checkout', 'stripe'],
    'checkout': ['cart', 'ecommerce', 'orders', 'inventory', 'veloce'],
    'ecommerce': ['checkout', 'cart', 'store', 'veloce', 'inventory'],
    'background': ['career', 'experience', 'progression', 'started', 'journey', 'summary'],
    'experience': ['background', 'career', 'progression', 'history', 'roles'],
    'yourself': ['career', 'experience', 'background', 'progression', 'summary', 'senior'],
    'introduce': ['career', 'experience', 'background', 'progression', 'summary', 'senior'],
    'outage': ['mttr', 'incident', 'monitoring', 'observability', 'telemetry', 'datadog', 'opentelemetry', 'deadlock', 'bottleneck', 'sla', 'latency', 'errors'],
    'incident': ['outage', 'mttr', 'monitoring', 'observability', 'telemetry', 'datadog', 'opentelemetry', 'post-mortem', 'sla'],
    'mttr': ['monitoring', 'observability', 'telemetry', 'datadog', 'opentelemetry', 'outage', 'incident', 'logs'],
    'on-call': ['sla', 'outage', 'monitoring', 'post-mortem', 'bottlenecks', 'uptime', 'incidents'],
    'post-mortem': ['post-mortems', 'blameless', 'mttr', 'monitoring', 'opentelemetry', 'datadog', 'sla']
  };

  // Technical signal guard to prevent false small-talk classification on real engineering questions
  const TECH_SIGNAL_REGEX = /\b(api|redis|kafka|postgres|postgresql|mysql|mongo|aws|eks|kubernetes|docker|golang|python|java|typescript|react|redux|jwt|bloom|envoy|fastapi|microservice|monolith|database|db|cache|pipeline|latency|p99|throughput|architecture|system|server|memory|cpu|algorithm|code|coding|function|scale|scaling|debug|deploy|incident|outage|resume|project|role|experience|securegate|eventmesh|finedge|veloce|nexus|cloudscale|ledger|partition|consensus|raft|telemetry|concurrency|shard|sharding|queue|webhook|stream|streaming|design|architect|build|implement)\b|\b(?:in|using|with|write|code\s+in)\s+go\b|\bgo\s+(?:lang|language|code|service|mutex|channel|channels|routine|routines|backend|server|struct|map)\b/i;

  // Small-talk & Greeting detector: immediately returns empty context to prevent accidental file citations
  const GREETING_OR_SMALLTALK_REGEX = /\b(hello|hi|hey|good\s+(?:morning|afternoon|evening|day)|hear\s+(?:and\s+see|me)|see\s+me|audio|video|loud\s+and\s+clear|good\s+to\s+meet|nice\s+to\s+meet|finally\s+meet|how\s+are\s+you(?:\s+(?:doing|today|guys|all))?(?=\s*(?:[?!.,]|$|and\b|right\s+now\b|this\s+(?:morning|afternoon|evening)))|how\s+is\s+(?:it\s+going|your\s+week)|how[’']s\s+(?:it\s+going|everything|your\s+week)|how\s+are\s+things|dialing\s+in|calling\s+in|ready\s+to\s+start|thanks\s+for\s+(?:joining|coming|taking)|checking\s+in)\b/i;

  function isGreetingOrSmallTalk(text) {
    if (!text) return true;
    const clean = text.trim();
    if (clean.length < 5) return true;
    if (TECH_SIGNAL_REGEX.test(clean)) return false;
    if (clean.split(/\s+/).length > 22) return false;
    return GREETING_OR_SMALLTALK_REGEX.test(clean);
  }

  // Pure Live Coding / LeetCode / Algorithmic Task detector:
  // When a user asks to write code or solve an algorithm, bypass RAG so the LLM solves it with pure intelligence without fake resume citations
  const CODING_TASK_REGEX = /\b(write\s+(?:a\s+|me\s+a\s+|an\s+)?(?:function|code|script|method|class|struct|algorithm|program|solution|query)|implement\s+(?:a\s+|an\s+)?(?:function|method|class|algorithm|lru|cache|stack|queue|tree|graph|linked\s*list|heap|trie|solution)|solve\s+(?:this|the)?\s*(?:problem|puzzle|leetcode)|find\s+(?:the\s+)?(?:maximum|minimum|longest|shortest|duplicate|median|kth|subarray|substring|cycle)|reverse\s+(?:a\s+)?(?:linked\s*list|string|array|tree)|invert\s+(?:a\s+)?(?:binary\s*tree|tree)|two\s*sum|three\s*sum|palindrome|fibonacci|valid\s*parentheses|merge\s*intervals|trapping\s*rain\s*water)\b/i;
  const CODING_SPEC_REGEX = /(?:\b(?:build|implement|write|create|code)\b[\s\S]{0,60}\b(?:[a-z0-9_]*(?:class|struct|function|method|interface|cache|queue|stack|tree|graph|trie|heap|iterator|hashmap|hashset)|data\s*structure|rate\s*limiter|scheduler|solution)\b|\bleast\s+(?:recently|frequently)\s+used\b|\bfrom\s+scratch[\s\S]{0,80}(?:\b(?:class|struct|function|method|cache)\b|o\(\s*(?:1|n)\s*\))|\bo\(\s*(?:1|n|log\s*n|n\s*log\s*n|n\^?2)\s*\)\s*(?:average\s+)?(?:time|complexity)\b|\bexample\s*\d*\s*:[\s\S]{0,220}\binput\s*:[\s\S]{0,140}\boutput\s*:|\bgiven\s+(?:an?|the|two)?\s*(?:positive|negative|non-?negative|sorted|unsorted|2d|binary|m\s*x\s*n)?\s*(?:arrays?|strings?|lists?|linked\s*lists?|matrices|matrix|grids?|trees?|binary\s*trees?|graphs?|nums|integers?|numbers?|sorted)\b|\b(?:code\s+(?:a|an|me|this|the)|leetcode|hackerrank|coderpad|line\s+by\s+line|binary\s+search|sliding\s+window|two\s+pointers|breadth[- ]first|depth[- ]first|bfs|dfs|lru\s+cache|lfu\s+cache|min\s+stack|serialize\s+and\s+deserialize|word\s+break|coin\s+change|time\s+and\s+space\s+complexity|big[- ]?o|return\s+true\s+if)\b|\btop\s*k\b|\bkth\s+(?:largest|smallest|element)\b|\b(?:number\s+of\s+islands|merge\s+k\s+sorted|longest\s+(?:increasing|common|palindromic|substring))\b|\bexplain\s+(?:your|the|this|every)?\s*(?:code|lines?)(?:\s+(?:line\s+by\s+line|step\s+by\s+step))?\b|\breturn\s+(?:the\s+(?:number\s+of|total\s+number|indices|index|length|count|maximum|minimum|smallest|largest|longest|shortest)|all\s+(?:such\s+)?(?:possible|valid))\b|\b[a-z_][a-z0-9_]*\([^)]*\)\s*(?:and|or|,)\s*[a-z_][a-z0-9_]*\([^)]*\))/i;

  function isCodingTask(text) {
    if (!text) return false;
    return CODING_TASK_REGEX.test(text) || CODING_SPEC_REGEX.test(text);
  }

  // Interview intent & clarification classifiers shared with renderer
  const CLARIFY_PROMPT_REGEX = /\b((?:do\s+you\s+have|got)\s+(?:any\s+)?(?:clarifying\s+|follow[- ]?up\s+|specific\s+)?questions|any\s+(?:clarifying\s+)?questions(?:\s+(?:or|before|first|for\s+me|on\s+this|regarding|about|you\s+(?:want|would\s+like)))|what\s+(?:questions|clarifications)\s+(?:do\s+you\s+have|would\s+you\s+like)|anything\s+(?:you\s+want|you\s+need|else\s+you(?:'d|\s+would)\s+like|to)\s+clarif(?:y|ied)|want\s+to\s+(?:ask\s+anything|clarify\s+anything)|before\s+(?:we|you)\s+(?:start|begin|jump\s+in|dive\s+(?:in|deeper)|go\s+deeper|write\s+code|code|design|solve|proceed)|before\s+(?:starting|diving|jumping|coding|designing)|let\s+me\s+know\s+if\s+you\s+have\s+(?:any\s+)?(?:clarifying\s+)?questions)\b/i;
  const GO_AHEAD_REGEX = /\b(go\s+ahead|start\s+(?:coding|designing|writing|implementing)|jump\s+(?:right\s+)?in|begin\s+now|you\s+can\s+(?:start|code|begin|proceed)|no\s+more\s+questions|that(?:'s|\s+is)\s+(?:all|enough|clear)|let(?:'s|\s+us)\s+(?:code|start|begin|proceed|solve)|make\s+(?:reasonable\s+)?assumptions)\b/i;
  const PURE_SYSTEM_DESIGN_REGEX = /(?:^(?:(?:okay|alright|great|now|next|so)\s*[,.—-]?\s*)*(?:design|architect)\s+(?:a|an)\b|\b(?:to\s+design\s+(?:a|an)|design\s+(?:a|an)\s+(?:scalable|distributed|high|real-time|global|multi|[a-z0-9-]+\s+(?:system|service|platform|ledger|pipeline|limiter|shortener|engine|architecture|feed|chat|storage))|how\s+would\s+you\s+(?:design|architect))\b)/i;
  const HYPOTHETICAL_PROMPT_REGEX = /\b(design\s+(?:a|an|the)|architect\s+(?:a|an|the)|how\s+would\s+you|what\s+would\s+you|what\s+do\s+you\s+do|how\s+do\s+you\s+(?:handle|deal|respond|prevent|reconcile|solve)|suppose|imagine|if\s+(?:a|an|you|your))\b/i;
  const RESUME_ANCHOR_REGEX = /\b(cloudscale|finedge|nexus|veloce|securegate|eventmesh|omnix|your\s+(?:past|previous|current|resume|role|experience|team|background)|you\s+(?:built|worked|led|handled|reduced|cut|migrated|mentioned))\b/i;
  const PAST_BEHAVIORAL_REGEX = /\b(?:how\s+did\s+you|what\s+did\s+you|where\s+did\s+you|why\s+did\s+you|describe\s+a\s+time|introduce\s+yourself|tell\s+me\s+about\s+(?:yourself|a\s+time|your\s+(?:role|background|experience|career|work|team|project)|an?\s+(?:outage|incident|bug|project|challenge|mistake|conflict|failure)\s+(?:you|at)))\b/i;
  const FEEDBACK_PRAISE_REGEX = /\b(rock[- ]solid|great\s+(?:design|answer|approach|breakdown|explanation|point)|makes\s+(?:a\s+lot\s+of\s+)?sense|love\s+(?:that|how|this|the)|good\s+(?:call|point|answer|design|catch)|sounds\s+(?:great|solid|good)|well\s+(?:explained|put|thought\s+out)|spot\s+on|nailed\s+it|that\s+works\s+great|very\s+solid|clean\s+design)\b/i;
  const QUESTION_OR_ASK_REGEX = /(\?|\b(how|why|what|when|where|which|who|walk\s+me|tell\s+me|explain|describe|suppose|imagine|could\s+you|can\s+you|would\s+you|what\s+if|(?:design|build|implement|write|code)\s+(?:a|an|the|this|me|how))\b)/i;

  function isClarifyPromptCue(text) {
    if (!text) return false;
    return CLARIFY_PROMPT_REGEX.test(text);
  }

  function isGoAheadCue(text) {
    if (!text) return false;
    return GO_AHEAD_REGEX.test(text);
  }

  function isFeedbackAck(text, hasHistory = false) {
    if (!text || !hasHistory) return false;
    return FEEDBACK_PRAISE_REGEX.test(text) && !QUESTION_OR_ASK_REGEX.test(text);
  }

  function isPureGreenfieldDesign(text) {
    if (!text || isCodingTask(text)) return false;
    return PURE_SYSTEM_DESIGN_REGEX.test(text) && !RESUME_ANCHOR_REGEX.test(text);
  }

  function isHypotheticalScenario(text, contextText = '') {
    if (!text) return false;
    if (isPureGreenfieldDesign(text)) return true;
    if (!contextText && HYPOTHETICAL_PROMPT_REGEX.test(text) && !RESUME_ANCHOR_REGEX.test(text)) return true;
    return false;
  }

  function isPastExperienceQuestion(text) {
    if (!text || isCodingTask(text)) return false;
    if (isClarifyPromptCue(text)) return false;
    if (HYPOTHETICAL_PROMPT_REGEX.test(text)) return false;
    return RESUME_ANCHOR_REGEX.test(text) || PAST_BEHAVIORAL_REGEX.test(text);
  }

  function hasTechnicalOrQuestionSignal(text) {
    if (!text) return false;
    const clean = String(text).trim();
    return TECH_SIGNAL_REGEX.test(clean) || QUESTION_OR_ASK_REGEX.test(clean) || isCodingTask(clean);
  }

  function extractCandidateName(resumeContent) {
    if (!resumeContent || typeof resumeContent !== 'string') return '';
    const lines = resumeContent.split(/\r?\n/).map(l => l.trim()).filter(Boolean).slice(0, 6);
    const skipHeader = /^(?:resume|curriculum\s+vitae|cv|summary|profile|experience|skills|education|projects|contact)\b/i;
    for (const line of lines) {
      if (skipHeader.test(line)) continue;
      if (/[@|/:\\]/.test(line) || /\d/.test(line)) continue;
      if (/^[A-Za-z][A-Za-z'.-]+(?:\s+[A-Za-z]\.?)?(?:\s+[A-Za-z][A-Za-z'.-]+){1,2}$/.test(line)) {
        if (line === line.toUpperCase()) {
          return line
            .split(/\s+/)
            .map(part => {
              if (/^[A-Z]\.?$/.test(part)) return part;
              return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
            })
            .join(' ');
        }
        return line;
      }
    }
    return '';
  }

  /**
   * Tokenizes text into lowercase clean keywords
   */
  function extractKeywords(text) {
    if (!text) return [];
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_+#-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  /**
   * Detects company/project section banners (e.g. "CloudScale Technologies | Austin, TX", "SecureGate | Zero-Trust API Gateway")
   */
  function parseSectionEntityBanner(line) {
    if (!line || !line.includes('|')) return null;
    const clean = line.trim();
    if (clean.length > 90 || /[@]|https?:\/\//i.test(clean) || /\(\d{3}\)/.test(clean)) return null;
    const parts = clean.split('|');
    if (parts.length !== 2) return null;
    const left = parts[0].trim();
    const right = parts[1].trim();
    if (!left || !right || left.length > 48) return null;
    // Skip job-title + date lines (e.g. "Senior Software Engineer | March 2022 – Present")
    if (/^(?:senior|staff|principal|lead|junior|associate|software|backend|frontend|full[- ]?stack|systems|platform|devops|cloud|data|site\s+reliability)\b/i.test(left)) {
      return null;
    }
    if (/^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?|\d{4}|present)\b/i.test(right)) {
      return null;
    }
    const words = left.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(Boolean);
    if (words.length === 0) return null;
    const stopEntity = new Set(['the', 'and', 'for', 'my', 'our', 'new', 'old', 'core', 'real', 'time', 'api', 'app']);
    const entity = words.find(w => w.length >= 3 && !stopEntity.has(w)) || words[0];
    return {
      sectionHeader: clean,
      sectionEntity: entity
    };
  }

  /**
   * Chunks a context file into logical blocks with exact 1-indexed startLine and endLine
   */
  function chunkFile(fileName, content) {
    if (!content) return [];
    const lines = content.split(/\r?\n/);
    const chunks = [];
    let currentLines = [];
    let chunkStartLine = 1;
    let activeSectionHeader = '';
    let activeSectionEntity = '';
    let chunkSectionHeader = '';
    let chunkSectionEntity = '';

    function flushChunk() {
      if (currentLines.length === 0) return;
      const text = currentLines.join('\n').trim();
      const endLine = chunkStartLine + currentLines.length - 1;
      
      if (text.length >= 40) {
        chunks.push({
          fileName,
          text,
          startLine: chunkStartLine,
          endLine: endLine,
          sectionHeader: chunkSectionHeader,
          sectionEntity: chunkSectionEntity
        });
      }
      currentLines = [];
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const isHeaderOrDivider = /^\s*(?:#{1,4}\s+|\={4,}|\-{4,}|\*{4,})/.test(line);
      const bannerMeta = parseSectionEntityBanner(line);

      if (bannerMeta) {
        const onlyOpeningDivider = currentLines.length <= 2 && currentLines.every(l => /^\s*=+\s*$/.test(l));
        if (currentLines.length > 0 && !onlyOpeningDivider) {
          flushChunk();
          chunkStartLine = lineNum;
        } else if (currentLines.length === 0) {
          chunkStartLine = lineNum;
        }
        activeSectionHeader = bannerMeta.sectionHeader;
        activeSectionEntity = bannerMeta.sectionEntity;
        chunkSectionHeader = activeSectionHeader;
        chunkSectionEntity = activeSectionEntity;
        currentLines.push(line);
      } else if (isHeaderOrDivider && currentLines.length > 0) {
        flushChunk();
        chunkStartLine = lineNum;
        chunkSectionHeader = activeSectionHeader;
        chunkSectionEntity = activeSectionEntity;
        currentLines.push(line);
      } else if (line.trim() === '' && currentLines.length >= 12) {
        flushChunk();
        chunkStartLine = lineNum + 1;
      } else {
        if (currentLines.length === 0) {
          if (line.trim() === '') {
            chunkStartLine = lineNum + 1;
            continue;
          }
          chunkStartLine = lineNum;
          chunkSectionHeader = activeSectionHeader;
          chunkSectionEntity = activeSectionEntity;
        }
        currentLines.push(line);
      }
    }
    flushChunk();

    return chunks;
  }

  /**
   * Scores a chunk against the query keywords and concept synonyms using strict whole-word matching
   */
  function scoreChunk(chunk, queryKeywords, queryTextLower, conceptSynonyms = new Set()) {
    const textLower = chunk.text.toLowerCase();
    const fileNameLower = (chunk.fileName || '').toLowerCase();
    const sectionLower = (chunk.sectionHeader || '').toLowerCase();
    let score = 0;
    let distinctDirectMatches = 0;

    for (const kw of queryKeywords) {
      // Strict whole-word match only (weight: 3, capped at 2 hits so large overview files do not dominate)
      const regex = new RegExp('\\b' + kw.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'g');
      const matches = textLower.match(regex);
      const sectionHit = sectionLower ? regex.test(sectionLower) : false;
      if (matches || sectionHit) {
        if (matches) score += Math.min(matches.length, 2) * 3;
        if (sectionHit) score += 5;
        distinctDirectMatches++;
      }

      // Match in file name (weight: 4)
      if (fileNameLower.includes(kw)) {
        score += 4;
        distinctDirectMatches++;
      }
    }

    // Concept / Synonym semantic match (weight: 2)
    let conceptSynonymMatches = 0;
    for (const syn of conceptSynonyms) {
      const synRegex = new RegExp('\\b' + syn.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'g');
      if (synRegex.test(textLower)) {
        score += 2;
        conceptSynonymMatches++;
      }
    }

    // Multi-word phrase bonus (weight: 6)
    if (queryKeywords.length >= 2) {
      for (let i = 0; i < queryKeywords.length - 1; i++) {
        const phrase = queryKeywords[i] + ' ' + queryKeywords[i + 1];
        if (textLower.includes(phrase)) {
          score += 6;
        }
      }
    }

    return { score, distinctDirectMatches, conceptSynonymMatches };
  }

  /**
   * Main Conversational Retrieval function
   */
  function getRelevantContext(query, contexts, conversationHistory = [], maxSnippets = 3, maxTotalChars = 4800) {
    const emptyResult = {
      contextText: '',
      primarySource: null,
      sources: [],
      toString: function () { return ''; }
    };

    if (!query) return emptyResult;

    // 1. Check if query is small talk or greeting -> if so, bypass RAG completely
    if (isGreetingOrSmallTalk(query)) {
      return emptyResult;
    }

    // 2. Check if query is a live coding or algorithmic problem -> let pure LLM intelligence solve without false resume citations
    if (isCodingTask(query)) {
      return emptyResult;
    }

    // 2b. Pure greenfield system design without resume/employer anchors -> prevent partial keyword collisions from leaking past roles
    if (isPureGreenfieldDesign(query)) {
      return emptyResult;
    }

    if (!contexts || !Array.isArray(contexts)) {
      contexts = [];
    }

    // 3. Build chunk list across all context files with exact line numbers
    const allChunks = [];
    for (const file of contexts) {
      if (file && file.content) {
        const chunks = chunkFile(file.fileName || 'document.txt', file.content);
        allChunks.push(...chunks);
      }
    }

    if (allChunks.length === 0) return emptyResult;

    // 4. Extract query keywords
    let keywords = extractKeywords(query);

    // Context Expansion: Check if query is an explicit technical follow-up
    const isTechnicalFollowUp = /\b(it|that|this|those|them|they|earlier|before|mentioned|again|too|also|you said)\b/i.test(query);
    if (isTechnicalFollowUp && keywords.length <= 2 && Array.isArray(conversationHistory) && conversationHistory.length > 0) {
      const lastMsg = conversationHistory[conversationHistory.length - 1];
      const prevMsg = conversationHistory[conversationHistory.length - 2];
      const contextSnippet = ((prevMsg ? (typeof prevMsg === 'string' ? prevMsg : prevMsg.content) : '') + ' ' + (lastMsg ? (typeof lastMsg === 'string' ? lastMsg : lastMsg.content) : '')).trim();
      const priorKeywords = extractKeywords(contextSnippet).slice(0, 4);
      keywords = Array.from(new Set([...keywords, ...priorKeywords]));
    }

    if (keywords.length === 0) {
      return emptyResult;
    }

    // 5. Expand concept synonyms
    const conceptSynonyms = new Set();
    for (const kw of keywords) {
      if (SYNONYM_MAP[kw]) {
        for (const s of SYNONYM_MAP[kw]) {
          if (!keywords.includes(s)) conceptSynonyms.add(s);
        }
      }
    }

    const queryLower = (query || '').toLowerCase();
    const knownEntities = Array.from(new Set(allChunks.map(c => c.sectionEntity).filter(Boolean)));
    const queriedEntities = knownEntities.filter(ent => new RegExp('\\b' + ent.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&') + '\\b', 'i').test(queryLower));

    // 6. Score all chunks (give deep-dive files a priority edge and isolate named employers/projects when explicitly requested)
    const scored = allChunks.map(chunk => {
      const chunkEnt = chunk.sectionEntity || '';
      if (queriedEntities.length > 0 && chunkEnt && !queriedEntities.includes(chunkEnt)) {
        return { chunk, score: -1, distinctDirectMatches: 0 };
      }

      const res = scoreChunk(chunk, keywords, queryLower, conceptSynonyms);
      const isDeepDive = /deep-dive/i.test(chunk.fileName || '');
      const entityMatchBoost = (queriedEntities.length > 0 && chunkEnt && queriedEntities.includes(chunkEnt)) ? 10 : 0;
      const adjustedScore = res.score + entityMatchBoost + (isDeepDive && res.distinctDirectMatches >= 1 ? 3 : 0);
      return {
        chunk,
        score: adjustedScore,
        distinctDirectMatches: res.distinctDirectMatches,
        conceptSynonymMatches: res.conceptSynonymMatches
      };
    });

    // 7. Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // 8. Select top matches: Require at least 2 distinct keyword matches and score >= 9
    // (or 1 direct anchor + 2+ strong concept synonyms with score >= 14), preventing false collisions
    const MIN_RELEVANCE_SCORE = 9;
    const MIN_DISTINCT_MATCHES = keywords.length >= 2 ? 2 : 1;
    const selected = [];
    let currentChars = 0;
    let summaryDeepDiveCount = 0;

    for (const item of scored) {
      const meetsDirect = item.distinctDirectMatches >= MIN_DISTINCT_MATCHES;
      const meetsStrongSynonym = item.distinctDirectMatches >= 1 && item.conceptSynonymMatches >= 2 && item.score >= 14;
      if (item.score < MIN_RELEVANCE_SCORE || (!meetsDirect && !meetsStrongSynonym)) continue;
      if (selected.length >= maxSnippets) break;
      if (/summary-deep-dive/i.test(item.chunk.fileName || '') && summaryDeepDiveCount >= 1) {
        continue;
      }

      const chunkText = item.chunk.text;
      if (currentChars + chunkText.length > maxTotalChars && selected.length > 0) {
        continue;
      }

      selected.push(item.chunk);
      currentChars += chunkText.length;
      if (/summary-deep-dive/i.test(item.chunk.fileName || '')) {
        summaryDeepDiveCount++;
      }
    }

    if (selected.length === 0) {
      return emptyResult;
    }

    // 9. Format clean context block
    const contextText = selected
      .map(c => {
        const linePart = c.startLine ? ` (lines ${c.startLine}-${c.endLine})` : '';
        const secPart = (c.sectionHeader && !c.text.includes(c.sectionHeader)) ? ` | ${c.sectionHeader}` : '';
        return `=== Relevant Context: ${c.fileName}${linePart}${secPart} ===\n${c.text}`;
      })
      .join('\n\n');

    // 10. Extract primary source and list of sources
    const primaryFileChunk = selected.find(c => c.fileName && c.fileName !== 'Previous Discussion' && c.startLine > 0);
    const primarySource = primaryFileChunk ? {
      fileName: primaryFileChunk.fileName,
      startLine: primaryFileChunk.startLine,
      endLine: primaryFileChunk.endLine
    } : null;

    const sources = selected
      .filter(c => c.fileName && c.fileName !== 'Previous Discussion' && c.startLine > 0)
      .map(c => ({
        fileName: c.fileName,
        startLine: c.startLine,
        endLine: c.endLine
      }));

    return {
      contextText,
      primarySource,
      sources,
      toString: function () {
        return this.contextText;
      }
    };
  }

  return {
    extractKeywords,
    chunkFile,
    scoreChunk,
    getRelevantContext,
    isGreetingOrSmallTalk,
    isCodingTask,
    isClarifyPromptCue,
    isGoAheadCue,
    isFeedbackAck,
    isPureGreenfieldDesign,
    isHypotheticalScenario,
    isPastExperienceQuestion,
    hasTechnicalOrQuestionSignal,
    extractCandidateName
  };
}));
