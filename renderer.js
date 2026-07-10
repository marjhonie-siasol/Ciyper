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
const MODEL_NAME = 'meta-llama/llama-4-scout-17b-16e-instruct';

// System prompt text holder
let systemInstructionText = "";
let sessionHistory = [];

function rotateApiKey() {
  if (activeKeyIndex < GEMINI_API_KEYS.length - 1) {
    activeKeyIndex++;
    const nextType = GEMINI_API_KEYS[activeKeyIndex].type;
    const label = nextType === 'primary' ? 'Primary Key' : nextType === 'backup1' ? 'Backup Key 1' : 'Backup Key 2';
    console.warn(`API key failover triggered. Switching to: ${label}`);
    updateStatus(`Switching to ${label}...`, 'thinking');
    return true;
  }
  return false;
}

async function loadSystemInstructions() {
  try {
    const db = await ipcRenderer.invoke('get-db-data');
    if (db) {
      // Load all saved API keys
      GEMINI_API_KEYS = [];
      if (db.settings.apiKey) GEMINI_API_KEYS.push({ type: 'primary', key: db.settings.apiKey });
      if (db.settings.apiKeyBackup1) GEMINI_API_KEYS.push({ type: 'backup1', key: db.settings.apiKeyBackup1 });
      if (db.settings.apiKeyBackup2) GEMINI_API_KEYS.push({ type: 'backup2', key: db.settings.apiKeyBackup2 });
      activeKeyIndex = 0;

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

      // Load Rules
      let rulesText = "";
      if (db.settings.rules && db.settings.rules.length > 0) {
        db.settings.rules.forEach(r => {
          rulesText += `\n\n=== Rule: ${r.fileName} ===\n${r.content}`;
        });
      }

      systemInstructionText = `# SYSTEM PROTOCOL (YOUR PERSONA AND BEHAVIORS)

## IDENTITY (YOU ARE THIS PERSON):
${resumeText}

## ADDITIONAL DEV CONTEXT (FACTS ABOUT YOUR WORK/STYLE):
${contextText}

## GUIDELINES, BEHAVIORS, AND POLICIES (OBEY THESE AT ALL TIMES):
${rulesText}
`;
    }
  } catch (err) {
    console.error("Failed to load instructions from local database:", err);
  }
}

// Load rules and persona context on app launch
loadSystemInstructions();

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
      const historySnippet = sessionHistory.slice(-6).join("\n"); // use last 3 dialogue turns
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
            content: `Summarize the main topic discussed in this job interview conversation in a short sentence or title. The title MUST be under 10 words and under 60 characters. Do not use quotation marks, punctuation, or special characters. Conversation:\n\n${historySnippet}`
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
      aiTitle = question.length > 60 ? question.substring(0, 57) + "..." : question;
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

// Expand/Collapse Toggle Logic
expandToggleBtn.addEventListener('click', () => {
  isExpanded = !isExpanded;
  if (isExpanded) {
    chatPanel.classList.remove('collapsed-panel');
    chevronIcon.style.transform = 'rotate(180deg)';
    
    // Restore custom dimensions of chat panel
    chatPanel.style.width = `${chatPanelWidth}px`;
    chatPanel.style.height = `${chatPanelHeight}px`;
    
    // Resize Electron window to fit expanded layout
    ipcRenderer.send('resize-window', { width: chatPanelWidth + 40, height: chatPanelHeight + 120 });
  } else {
    chatPanel.classList.add('collapsed-panel');
    chevronIcon.style.transform = 'rotate(0deg)';
    // Resize Electron window back to collapsed control bar layout (keep width matching to prevent visual jump)
    ipcRenderer.send('resize-window', { width: chatPanelWidth + 40, height: 68 });
  }
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
  
  if (label) {
    const labelDiv = document.createElement('div');
    labelDiv.classList.add('message-label', 'mb-1', 'select-none');
    labelDiv.innerText = label;
    groupDiv.appendChild(labelDiv);
  }
  
  const msgDiv = document.createElement('div');
  msgDiv.classList.add('message', sender);
  msgDiv.innerText = text;
  groupDiv.appendChild(msgDiv);
  
  messagesList.appendChild(groupDiv);
  return { groupDiv, msgDiv };
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
                  replyBubble.innerText = "";
                  hasContent = true;
                }
                replyBubble.innerText += textChunk;
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
  const { msgDiv: userBubble } = appendMessage(text, 'user', 'Me');
  const { msgDiv: replyBubble } = appendMessage("Thinking...", 'ai', 'AI Respond');
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
            { role: 'user', content: text }
          ],
          stream: true
        })
      });
      
      if (!response.ok) {
        const errText = await response.text();
        const failStatus = response.status === 429 ? 'rate-limited' : 'invalid';
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if ((response.status === 429 || response.status === 400) && rotateApiKey()) {
          continue; // Retry loop with next key
        }
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      
      await streamResponse(response, replyBubble);
      sessionHistory.push(`User: ${text}`);
      sessionHistory.push(`AI: ${replyBubble.innerText}`);
      
      ipcRenderer.send('set-key-status', { keyType: currentType, status: 'healthy' });
      ipcRenderer.send('increment-api-usage', { keyType: currentType });
      success = true;
    } catch (error) {
      const failStatus = error.message.includes("429") ? 'rate-limited' : 'invalid';
      ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

      if (rotateApiKey()) {
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
  sourceNode.connect(analyser);
  
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
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
  }
  const averageVolume = sum / dataArray.length;
  
  if (averageVolume > VOLUME_THRESHOLD) {
    if (!isRecording) {
      startRecording();
    } else if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
      updateStatus("Recording sound...", 'listening');
    }
  } else {
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
  const { msgDiv: statusIndicator } = appendMessage("[Transcribing audio...]", 'user', 'Interviewer Question');
  const { msgDiv: replyBubble } = appendMessage("Thinking...", 'ai', 'AI Respond');
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

      const transResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentKey}`
        },
        body: formData
      });

      if (!transResponse.ok) {
        const errText = await transResponse.text();
        const failStatus = transResponse.status === 429 ? 'rate-limited' : 'invalid';
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if ((transResponse.status === 429 || transResponse.status === 400) && rotateApiKey()) {
          continue; // Retry loop with next key
        }
        throw new Error(`Whisper Transcription HTTP ${transResponse.status}: ${errText}`);
      }

      const transData = await transResponse.json();
      const transcribedText = (transData.text || "").trim();
      
      if (!transcribedText) {
        // No speech detected
        if (statusIndicator) statusIndicator.remove();
        replyBubble.innerText = "[No speech detected]";
        success = true;
        break;
      }

      // Update user bubble with final transcription
      statusIndicator.innerText = transcribedText;

      // 2. Query Llama 3.3 for the response
      updateStatus("Analyzing response...", 'thinking');
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
            { role: 'user', content: transcribedText }
          ],
          stream: true
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        const failStatus = response.status === 429 ? 'rate-limited' : 'invalid';
        ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

        if ((response.status === 429 || response.status === 400) && rotateApiKey()) {
          continue; // Retry loop with next key
        }
        throw new Error(`Llama Completion HTTP ${response.status}: ${errText}`);
      }
      
      await streamResponse(response, replyBubble);
      sessionHistory.push(`User: ${transcribedText}`);
      sessionHistory.push(`AI: ${replyBubble.innerText}`);
 
      ipcRenderer.send('set-key-status', { keyType: currentType, status: 'healthy' });
      ipcRenderer.send('increment-api-usage', { keyType: currentType });
      success = true;
    } catch (error) {
      const failStatus = error.message.includes("429") ? 'rate-limited' : 'invalid';
      ipcRenderer.send('set-key-status', { keyType: currentType, status: failStatus });

      if (rotateApiKey()) {
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
      
      // Resize Electron window to fit layout instantly (animate: false)
      ipcRenderer.send('resize-window', { 
        width: chatPanelWidth + 40, 
        height: chatPanelHeight + 120, 
        animate: false 
      });
      
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

// Auto-start capture on app launch
window.addEventListener('DOMContentLoaded', async () => {
  // Set initial window size for collapsed state
  ipcRenderer.send('resize-window', { width: 720, height: 68 });
  
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
