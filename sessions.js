const { ipcRenderer, shell } = require('electron');

// DOM Elements
const startSessionBtn = document.getElementById('start-session-btn');
const closeBtn = document.getElementById('close-btn');
const minimizeBtn = document.getElementById('minimize-btn');

// Main Tab buttons & panels
const tabRecent = document.getElementById('tab-recent');
const tabFiles = document.getElementById('tab-files');
const tabKeys = document.getElementById('tab-keys');
const tabModels = document.getElementById('tab-models');
const tabInfo = document.getElementById('tab-info');
const panelRecent = document.getElementById('panel-recent');
const panelFiles = document.getElementById('panel-files');
const panelKeys = document.getElementById('panel-keys');
const panelModels = document.getElementById('panel-models');
const panelInfo = document.getElementById('panel-info');

// API Key inputs & buttons (Primary, Backup 1, Backup 2)
const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const togglePasswordBtn = document.getElementById('toggle-password-btn');
const togglePasswordIcon = document.getElementById('toggle-password-icon');

const apiKeyInputBackup1 = document.getElementById('api-key-input-backup1');
const saveKeyBtnBackup1 = document.getElementById('save-key-btn-backup1');
const togglePasswordBtnBackup1 = document.getElementById('toggle-password-btn-backup1');
const togglePasswordIconBackup1 = document.getElementById('toggle-password-icon-backup1');

const apiKeyInputBackup2 = document.getElementById('api-key-input-backup2');
const saveKeyBtnBackup2 = document.getElementById('save-key-btn-backup2');
const togglePasswordBtnBackup2 = document.getElementById('toggle-password-btn-backup2');
const togglePasswordIconBackup2 = document.getElementById('toggle-password-icon-backup2');

// Resume elements
const addResumeBtn = document.getElementById('add-resume-btn');
const resumeFileInfo = document.getElementById('resume-file-info');
let tempResume = null;

// File Upload elements
const addFileBtn = document.getElementById('add-file-btn');
const filesListContainer = document.getElementById('files-list-container');

// AI Models UI elements
const customModelDropdown = document.getElementById('custom-model-dropdown');
const customModelValue = document.getElementById('custom-model-value');
const customModelOptions = document.getElementById('custom-model-options');
const customModelArrow = document.getElementById('custom-model-arrow');
const saveModelBtn = document.getElementById('save-model-btn');
const modelsInfoBtn = document.getElementById('models-info-btn');
const modelsInfoModal = document.getElementById('models-info-modal');
const modelsModalOkBtn = document.getElementById('models-modal-ok-btn');

// App state
let localDb = null;
let activeSubtab = 'context'; // 'context' or 'rules'

// Start/Close Window hooks
if (startSessionBtn) {
  let countdownTimer = null;
  let secondsLeft = 5;

  startSessionBtn.addEventListener('click', () => {
    if (countdownTimer) {
      // If timer is already running, click cancels the countdown
      clearInterval(countdownTimer);
      countdownTimer = null;
      
      // Reset button back to original "Start Session" white theme state
      startSessionBtn.classList.remove('countdown-running');
      startSessionBtn.innerText = "Start Session";
      startSessionBtn.style.backgroundColor = "#FFFFFF";
      startSessionBtn.style.color = "#131313";
      return;
    }

    // Validate if at least the Primary API key is present
    if (!localDb || !localDb.settings.apiKey) {
      if (apiKeyModal) {
        apiKeyModal.classList.remove('hidden');
        apiKeyModal.classList.add('flex');
      }
      return;
    }

    // Determine configured countdown duration (0: Immediately, 3, 5, 10s)
    const configuredDuration = localDb && localDb.settings && localDb.settings.countdownDuration !== undefined
      ? parseInt(localDb.settings.countdownDuration, 10)
      : 5;

    if (configuredDuration === 0) {
      startSessionBtn.innerText = "Launching...";
      ipcRenderer.send('start-session');
      return;
    }

    // Start countdown state
    secondsLeft = configuredDuration;
    
    // Change button styles to a darker cancel theme
    startSessionBtn.classList.add('countdown-running');
    startSessionBtn.style.backgroundColor = "#2F2F2F";
    startSessionBtn.style.color = "#E2E2E2";
    startSessionBtn.innerText = `Cancel (${secondsLeft}s)`;

    countdownTimer = setInterval(() => {
      secondsLeft--;
      if (secondsLeft > 0) {
        startSessionBtn.innerText = `Cancel (${secondsLeft}s)`;
      } else {
        clearInterval(countdownTimer);
        countdownTimer = null;
        startSessionBtn.classList.remove('countdown-running');
        startSessionBtn.innerText = "Launching...";
        ipcRenderer.send('start-session');
      }
    }, 1000);
  });
}

if (minimizeBtn) {
  minimizeBtn.addEventListener('click', () => {
    ipcRenderer.send('minimize-window');
  });
}

if (closeBtn) {
  closeBtn.addEventListener('click', () => {
    ipcRenderer.send('close-window');
  });
}

// Load Database Data on Startup
async function loadDbData() {
  localDb = await ipcRenderer.invoke('get-db-data');
  renderUI();
}

// Populate the UI components with database state
function renderUI() {
  if (!localDb) return;

  // 1. Render Primary API Key
  if (localDb.settings.apiKey) {
    apiKeyInput.value = localDb.settings.apiKey;
    apiKeyInput.readOnly = true;
    saveKeyBtn.innerText = "Remove";
  } else {
    apiKeyInput.value = "";
    apiKeyInput.readOnly = false;
    saveKeyBtn.innerText = "Save";
  }

  // 2. Render Backup 1 API Key
  if (localDb.settings.apiKeyBackup1) {
    apiKeyInputBackup1.value = localDb.settings.apiKeyBackup1;
    apiKeyInputBackup1.readOnly = true;
    saveKeyBtnBackup1.innerText = "Remove";
  } else {
    apiKeyInputBackup1.value = "";
    apiKeyInputBackup1.readOnly = false;
    saveKeyBtnBackup1.innerText = "Save";
  }

  // 3. Render Backup 2 API Key
  if (localDb.settings.apiKeyBackup2) {
    apiKeyInputBackup2.value = localDb.settings.apiKeyBackup2;
    apiKeyInputBackup2.readOnly = true;
    saveKeyBtnBackup2.innerText = "Remove";
  } else {
    apiKeyInputBackup2.value = "";
    apiKeyInputBackup2.readOnly = false;
    saveKeyBtnBackup2.innerText = "Save";
  }

  // 4. Render Resume Status
  if (localDb.settings.resume && localDb.settings.resume.fileName) {
    // Resume is saved in database
    resumeFileInfo.innerText = localDb.settings.resume.fileName;
    resumeFileInfo.classList.remove('text-gray-500');
    resumeFileInfo.classList.add('text-white');
    addResumeBtn.innerText = "Remove";
  } else if (tempResume) {
    // Resume is selected but not yet saved
    resumeFileInfo.innerText = tempResume.fileName;
    resumeFileInfo.classList.remove('text-gray-500');
    resumeFileInfo.classList.add('text-white');
    addResumeBtn.innerText = "Save";
  } else {
    // Default empty state
    resumeFileInfo.innerText = "file must be .txt format";
    resumeFileInfo.classList.remove('text-white');
    resumeFileInfo.classList.add('text-gray-500');
    addResumeBtn.innerText = "Add Resume";
  }

  // 4b. Render Selected AI Model
  if (customModelValue && customModelDropdown) {
    const activeModelIndicator = document.getElementById('active-model-indicator');
    const validModels = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

    let selectedVal = localDb.settings.selectedModel;
    if (!selectedVal || !validModels.includes(selectedVal)) {
      selectedVal = 'openai/gpt-oss-120b';
    }

    customModelValue.innerText = selectedVal;
    customModelValue.setAttribute('data-selected-value', selectedVal);
    customModelValue.classList.remove('text-gray-400');
    customModelValue.classList.add('text-white');
    
    if (activeModelIndicator) {
      activeModelIndicator.innerText = selectedVal;
      activeModelIndicator.style.fontStyle = "normal";
      activeModelIndicator.style.color = "#FFFFFF";
    }

    // Update checkmark visibility in model options
    if (customModelOptions) {
      const options = customModelOptions.querySelectorAll('.custom-option');
      options.forEach(opt => {
        const val = opt.getAttribute('data-value');
        const checkIcon = opt.querySelector('.checkmark-icon');
        if (val === selectedVal) {
          if (checkIcon) checkIcon.classList.remove('hidden');
        } else {
          if (checkIcon) checkIcon.classList.add('hidden');
        }
      });
    }
  }

  // 5. Render Sessions list
  panelRecent.innerHTML = "";
  if (localDb.sessions && localDb.sessions.length > 0) {
    localDb.sessions.forEach(sess => {
      const row = document.createElement('div');
      row.className = "flex items-center justify-between py-1 min-w-0 overflow-hidden";
      
      row.innerHTML = `
        <button class="delete-session-btn hover:opacity-80 transition-all p-1 mr-3 flex-shrink-0" data-id="${sess.id}" title="Delete Session">
          <img src="https://img.icons8.com/fluency-systems-regular/96/FA5252/trash--v1.png" alt="delete" class="w-4 h-4 opacity-75 hover:opacity-100">
        </button>
        <span class="text-sm font-normal truncate pr-4 min-w-0 flex-grow" title="${sess.name}">${sess.name}</span>
        <div class="flex items-center space-x-3.5 flex-shrink-0">
          <span class="text-xs bg-theme-btn text-gray-200 px-3 py-1 rounded-full font-medium">${sess.duration}</span>
          <span class="text-xs text-gray-300 font-medium">${sess.date}</span>
        </div>
      `;

      row.querySelector('.delete-session-btn').addEventListener('click', async (e) => {
        const id = e.currentTarget.getAttribute('data-id');
        localDb = await ipcRenderer.invoke('delete-session', id);
        renderUI();
      });

      panelRecent.appendChild(row);
    });
  } else {
    panelRecent.innerHTML = `<div class="text-xs text-gray-500 text-center py-8">No recent sessions found</div>`;
  }

  // 6. Render Files list (Context / Rules)
  filesListContainer.innerHTML = "";
  const filesList = activeSubtab === 'context' ? localDb.settings.contexts : localDb.settings.rules;

  if (filesList && filesList.length > 0) {
    filesList.forEach(file => {
      const fileRow = document.createElement('div');
      fileRow.className = "flex items-center justify-start py-1 min-w-0 overflow-hidden";
      
      fileRow.innerHTML = `
        <button class="delete-file-btn hover:opacity-80 transition-all p-1 mr-3 flex-shrink-0" data-id="${file.id}" title="Delete File">
          <img src="https://img.icons8.com/fluency-systems-regular/96/FA5252/trash--v1.png" alt="delete" class="w-4 h-4 opacity-75 hover:opacity-100">
        </button>
        <span class="text-sm font-normal truncate pr-4 min-w-0 flex-grow" title="${file.fileName}">${file.fileName}</span>
      `;

      fileRow.querySelector('.delete-file-btn').addEventListener('click', async () => {
        localDb = await ipcRenderer.invoke('delete-file', { type: activeSubtab, id: file.id });
        renderUI();
      });

      filesListContainer.appendChild(fileRow);
    });
  } else {
    filesListContainer.innerHTML = `<div class="text-xs text-gray-500 text-center py-6">No files added yet</div>`;
  }

  // Always refresh analytics charts
  renderAnalytics();

  // 6. Render Settings in Modal
  const invisibleModeToggle = document.getElementById('invisible-mode-toggle');
  if (invisibleModeToggle && localDb && localDb.settings) {
    const isInv = localDb.settings.invisibleMode !== undefined ? !!localDb.settings.invisibleMode : true;
    invisibleModeToggle.checked = isInv;
  }

  syncCountdownUI();
}

// Save / Delete API Key Event Handlers
if (saveKeyBtn) {
  saveKeyBtn.addEventListener('click', () => {
    const btnText = saveKeyBtn.innerText;
    if (btnText === "Save") {
      const key = apiKeyInput.value.trim();
      if (!key) {
        apiKeyInput.focus();
        apiKeyInput.placeholder = "Please enter an API Key first...";
        return;
      }
      ipcRenderer.send('save-api-key', { type: 'primary', key });
    } else if (btnText === "Remove") {
      ipcRenderer.send('save-api-key', { type: 'primary', key: "" });
    }
  });
}

if (saveKeyBtnBackup1) {
  saveKeyBtnBackup1.addEventListener('click', () => {
    const btnText = saveKeyBtnBackup1.innerText;
    if (btnText === "Save") {
      const key = apiKeyInputBackup1.value.trim();
      if (!key) {
        apiKeyInputBackup1.focus();
        apiKeyInputBackup1.placeholder = "Please enter an API Key first...";
        return;
      }
      ipcRenderer.send('save-api-key', { type: 'backup1', key });
    } else if (btnText === "Remove") {
      ipcRenderer.send('save-api-key', { type: 'backup1', key: "" });
    }
  });
}

if (saveKeyBtnBackup2) {
  saveKeyBtnBackup2.addEventListener('click', () => {
    const btnText = saveKeyBtnBackup2.innerText;
    if (btnText === "Save") {
      const key = apiKeyInputBackup2.value.trim();
      if (!key) {
        apiKeyInputBackup2.focus();
        apiKeyInputBackup2.placeholder = "Please enter an API Key first...";
        return;
      }
      ipcRenderer.send('save-api-key', { type: 'backup2', key });
    } else if (btnText === "Remove") {
      ipcRenderer.send('save-api-key', { type: 'backup2', key: "" });
    }
  });
}

ipcRenderer.on('save-api-key-success', () => {
  loadDbData();
});

// Upload / Save / Delete Resume Event
if (addResumeBtn) {
  addResumeBtn.addEventListener('click', async () => {
    const btnText = addResumeBtn.innerText;
    
    if (btnText === "Add Resume") {
      const fileData = await ipcRenderer.invoke('select-file');
      if (fileData) {
        tempResume = fileData;
        renderUI();
      }
    } else if (btnText === "Save") {
      if (tempResume) {
        const updatedDb = await ipcRenderer.invoke('save-resume', tempResume);
        if (updatedDb) {
          localDb = updatedDb;
          tempResume = null;
          renderUI();
        }
      }
    } else if (btnText === "Remove") {
      const updatedDb = await ipcRenderer.invoke('delete-file', { type: 'resume' });
      if (updatedDb) {
        localDb = updatedDb;
        tempResume = null;
        renderUI();
      }
    }
  });
}

// Upload Context/Rules File Event
if (addFileBtn) {
  addFileBtn.addEventListener('click', async () => {
    const updatedDb = await ipcRenderer.invoke('upload-file', activeSubtab);
    if (updatedDb) {
      localDb = updatedDb;
      renderUI();
    }
  });
}

// Main Tabs Navigation Logic
// Main Tabs Navigation Logic
if (tabRecent && tabFiles && tabKeys && tabModels && tabInfo && panelRecent && panelFiles && panelKeys && panelModels && panelInfo) {
  tabRecent.addEventListener('click', () => {
    tabRecent.classList.add('active');
    tabFiles.classList.remove('active');
    tabKeys.classList.remove('active');
    tabModels.classList.remove('active');
    tabInfo.classList.remove('active');
    panelRecent.classList.remove('hidden');
    panelFiles.classList.add('hidden');
    panelKeys.classList.add('hidden');
    panelModels.classList.add('hidden');
    panelInfo.classList.add('hidden');
  });

  tabFiles.addEventListener('click', () => {
    tabFiles.classList.add('active');
    tabRecent.classList.remove('active');
    tabKeys.classList.remove('active');
    tabModels.classList.remove('active');
    tabInfo.classList.remove('active');
    panelFiles.classList.remove('hidden');
    panelFiles.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelKeys.classList.add('hidden');
    panelModels.classList.add('hidden');
    panelInfo.classList.add('hidden');
  });

  tabKeys.addEventListener('click', () => {
    tabKeys.classList.add('active');
    tabRecent.classList.remove('active');
    tabFiles.classList.remove('active');
    tabModels.classList.remove('active');
    tabInfo.classList.remove('active');
    panelKeys.classList.remove('hidden');
    panelKeys.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelFiles.classList.add('hidden');
    panelModels.classList.add('hidden');
    panelInfo.classList.add('hidden');
  });

  tabModels.addEventListener('click', () => {
    tabModels.classList.add('active');
    tabRecent.classList.remove('active');
    tabFiles.classList.remove('active');
    tabKeys.classList.remove('active');
    tabInfo.classList.remove('active');
    panelModels.classList.remove('hidden');
    panelModels.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelFiles.classList.add('hidden');
    panelKeys.classList.add('hidden');
    panelInfo.classList.add('hidden');
  });

  tabInfo.addEventListener('click', () => {
    tabInfo.classList.add('active');
    tabRecent.classList.remove('active');
    tabFiles.classList.remove('active');
    tabKeys.classList.remove('active');
    tabModels.classList.remove('active');
    panelInfo.classList.remove('hidden');
    panelInfo.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelFiles.classList.add('hidden');
    panelKeys.classList.add('hidden');
    panelModels.classList.add('hidden');
  });
}

// My Files subtabs logic removed. Stays context-only.

// API Key Information Modal Logic


// API Key Show/Hide Password Toggle Logic (Primary, Backup 1, Backup 2)
if (togglePasswordBtn && togglePasswordIcon && apiKeyInput) {
  togglePasswordBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      togglePasswordIcon.src = 'https://img.icons8.com/forma-regular/96/visible.png';
      togglePasswordIcon.alt = 'hide password';
    } else {
      apiKeyInput.type = 'password';
      togglePasswordIcon.src = 'https://img.icons8.com/forma-regular/96/invisible.png';
      togglePasswordIcon.alt = 'show password';
    }
  });
}

if (togglePasswordBtnBackup1 && togglePasswordIconBackup1 && apiKeyInputBackup1) {
  togglePasswordBtnBackup1.addEventListener('click', () => {
    if (apiKeyInputBackup1.type === 'password') {
      apiKeyInputBackup1.type = 'text';
      togglePasswordIconBackup1.src = 'https://img.icons8.com/forma-regular/96/visible.png';
      togglePasswordIconBackup1.alt = 'hide password';
    } else {
      apiKeyInputBackup1.type = 'password';
      togglePasswordIconBackup1.src = 'https://img.icons8.com/forma-regular/96/invisible.png';
      togglePasswordIconBackup1.alt = 'show password';
    }
  });
}

if (togglePasswordBtnBackup2 && togglePasswordIconBackup2 && apiKeyInputBackup2) {
  togglePasswordBtnBackup2.addEventListener('click', () => {
    if (apiKeyInputBackup2.type === 'password') {
      apiKeyInputBackup2.type = 'text';
      togglePasswordIconBackup2.src = 'https://img.icons8.com/forma-regular/96/visible.png';
      togglePasswordIconBackup2.alt = 'hide password';
    } else {
      apiKeyInputBackup2.type = 'password';
      togglePasswordIconBackup2.src = 'https://img.icons8.com/forma-regular/96/invisible.png';
      togglePasswordIconBackup2.alt = 'show password';
    }
  });
}

// Dynamic Analytics Graph Rendering Function
function renderAnalytics() {
  if (!localDb) return;
  const keys = ['primary', 'backup1', 'backup2'];
  
  keys.forEach(keyType => {
    // 1. Calculate Total queries
    let total = 0;
    const history = localDb.apiUsageHistory ? (localDb.apiUsageHistory[keyType] || {}) : {};
    Object.values(history).forEach(val => total += val);
    document.getElementById(`analytics-total-${keyType}`).innerText = total;

    // 2. Set Status Badge
    const statusBadge = document.getElementById(`analytics-status-${keyType}`);
    let isSaved = false;
    if (keyType === 'primary') isSaved = !!localDb.settings.apiKey;
    else if (keyType === 'backup1') isSaved = !!localDb.settings.apiKeyBackup1;
    else if (keyType === 'backup2') isSaved = !!localDb.settings.apiKeyBackup2;

    const savedStatus = localDb.keyStatuses ? localDb.keyStatuses[keyType] : null;
    const finalStatus = isSaved ? (savedStatus || "healthy") : "unused";

    if (finalStatus === "unused") {
      statusBadge.className = "text-xs px-2 py-0.5 rounded-full text-gray-400 border border-gray-700";
      statusBadge.style.backgroundColor = "#131313";
      statusBadge.style.borderColor = "rgba(47, 47, 47, 0.6)";
      statusBadge.innerText = "No key";
    } else {
      statusBadge.style.backgroundColor = "";
      statusBadge.style.borderColor = "";
      if (finalStatus === "rate-limited") {
        statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-yellow-950 bg-opacity-35 text-yellow-400 border border-yellow-700";
        statusBadge.innerText = "Rate Limited";
      } else if (finalStatus === "invalid") {
        statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-red-950 bg-opacity-35 text-red-400 border border-red-700";
        statusBadge.innerText = "Invalid";
      } else {
        statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-green-900 bg-opacity-35 text-green-400 border border-green-700";
        statusBadge.innerText = "Healthy";
      }
    }

    // 3. Draw last 7 days crypto-style glowing line chart
    const graphContainer = document.getElementById(`graph-${keyType}`);
    graphContainer.innerHTML = "";

    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      days.push(d.toISOString().split('T')[0]);
    }

    let maxVal = 5;
    days.forEach(day => {
      const val = history[day] || 0;
      if (val > maxVal) maxVal = val;
    });

    // Calculate line coordinates inside SVG viewBox="0 0 200 80"
    const points = [];
    const width = 200;
    const height = 80;
    const paddingX = 10;
    const paddingY = 12;
    const usableW = width - paddingX * 2;
    const usableH = height - paddingY * 2;

    days.forEach((day, index) => {
      const count = history[day] || 0;
      const x = paddingX + (index / 6) * usableW;
      const y = (height - paddingY) - (count / maxVal) * usableH;
      points.push({ x, y, count, day });
    });

    // Polyline points string
    const polylinePoints = points.map(p => `${p.x},${p.y}`).join(" ");

    // Gradient fill polygon string (close loop down to bottom floor)
    const areaPoints = `${points[0].x},${height - paddingY + 2} ` + points.map(p => `${p.x},${p.y}`).join(" ") + ` ${points[points.length - 1].x},${height - paddingY + 2}`;

    // Select theme colors (glowing emerald green for saved keys, slate gray if unused)
    const color = isSaved ? "#10B981" : "#4B5563";
    const gradId = `grad-${keyType}`;

    const svgNamespace = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(svgNamespace, "svg");
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    svg.setAttribute("class", "w-full h-full overflow-visible");

    // Add styling filters and elements
    svg.innerHTML = `
      <defs>
        <linearGradient id="${gradId}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity="0.35" />
          <stop offset="100%" stop-color="${color}" stop-opacity="0.0" />
        </linearGradient>
        <filter id="glow-${keyType}" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" flood-color="${color}" flood-opacity="0.4" />
        </filter>
      </defs>
      
      <!-- Gradient Fill Area -->
      <polygon points="${areaPoints}" fill="url(#${gradId})" />

      <!-- Glowing Line -->
      <polyline points="${polylinePoints}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" filter="url(#glow-${keyType})" />
    `;

    // Draw circular nodes and label text
    points.forEach(p => {
      // Circle Dot Node
      const circle = document.createElementNS(svgNamespace, "circle");
      circle.setAttribute("cx", p.x);
      circle.setAttribute("cy", p.y);
      circle.setAttribute("r", "3");
      circle.setAttribute("fill", color);
      circle.setAttribute("stroke", "#1e1e1e");
      circle.setAttribute("stroke-width", "1");
      circle.setAttribute("class", "cursor-pointer transition-all duration-200 hover:scale-150");
      


      // Custom Floating HTML Tooltip Trigger on Hover
      circle.addEventListener('mouseenter', (e) => {
        const tooltip = document.getElementById('analytics-tooltip');
        const tooltipDate = document.getElementById('tooltip-date');
        const tooltipQueries = document.getElementById('tooltip-queries');
        if (!tooltip || !tooltipDate || !tooltipQueries) return;

        const dateStr = new Date(p.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
        tooltipDate.innerText = dateStr;
        tooltipQueries.innerText = `${p.count} queries`;

        const rect = circle.getBoundingClientRect();
        tooltip.style.left = `${rect.left + window.scrollX + (rect.width / 2) - 45}px`;
        tooltip.style.top = `${rect.top + window.scrollY - 44}px`;

        tooltip.classList.remove('hidden');
        tooltip.classList.add('flex');
      });

      circle.addEventListener('mouseleave', () => {
        const tooltip = document.getElementById('analytics-tooltip');
        if (tooltip) {
          tooltip.classList.add('hidden');
          tooltip.classList.remove('flex');
        }
      });

      svg.appendChild(circle);

      // Text label at bottom
      const text = document.createElementNS(svgNamespace, "text");
      text.setAttribute("x", p.x);
      text.setAttribute("y", height - 2);
      text.setAttribute("text-anchor", "middle");
      text.setAttribute("fill", "#6B7280");
      text.setAttribute("font-size", "7.5");
      text.setAttribute("font-weight", "600");
      text.setAttribute("class", "select-none pointer-events-none");
      text.textContent = new Date(p.day).toLocaleDateString('en-US', { weekday: 'narrow' });
      svg.appendChild(text);
    });

    graphContainer.appendChild(svg);
  });
}

// Custom Model Dropdown Toggle & Selection Logic
if (customModelDropdown && customModelOptions && customModelArrow && customModelValue) {
  // Toggle Dropdown List Visibility
  customModelDropdown.addEventListener('click', () => {
    if (customModelDropdown.classList.contains('disabled')) return;
    const isHidden = customModelOptions.classList.contains('hidden');
    if (isHidden) {
      customModelOptions.classList.remove('hidden');
      customModelOptions.classList.add('flex');
      customModelArrow.style.transform = 'rotate(180deg)';
    } else {
      customModelOptions.classList.add('hidden');
      customModelOptions.classList.remove('flex');
      customModelArrow.style.transform = '';
    }
  });

  // Close Dropdown when clicking outside
  document.addEventListener('click', (e) => {
    if (!customModelDropdown.contains(e.target) && !customModelOptions.contains(e.target)) {
      customModelOptions.classList.add('hidden');
      customModelOptions.classList.remove('flex');
      customModelArrow.style.transform = '';
    }
  });

  // Select Option Click Handler
  const options = customModelOptions.querySelectorAll('.custom-option');
  options.forEach(opt => {
    opt.addEventListener('click', async () => {
      const val = opt.getAttribute('data-value');

      customModelValue.setAttribute('data-selected-value', val);
      customModelValue.innerText = val;
      customModelValue.classList.add('text-white');
      customModelValue.classList.remove('text-gray-400');

      // Update checkmarks
      options.forEach(o => {
        const oVal = o.getAttribute('data-value');
        const cIcon = o.querySelector('.checkmark-icon');
        if (oVal === val) {
          if (cIcon) cIcon.classList.remove('hidden');
        } else {
          if (cIcon) cIcon.classList.add('hidden');
        }
      });

      customModelOptions.classList.add('hidden');
      customModelOptions.classList.remove('flex');
      if (customModelArrow) customModelArrow.style.transform = '';

      // Auto-save immediately to database
      const updatedDb = await ipcRenderer.invoke('save-selected-model', val);
      if (updatedDb) {
        localDb = updatedDb;
        renderUI();
      }
    });
  });
}

// Link handler to open Groq models page in default desktop browser
const viewModelsLink = document.getElementById('view-models-link');
if (viewModelsLink) {
  viewModelsLink.addEventListener('click', (e) => {
    e.preventDefault();
    shell.openExternal('https://console.groq.com/docs/models');
  });
}

// Copy command listener for local data documentation
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.copy-db-cmd-btn');
  if (btn) {
    const cmdText = btn.getAttribute('data-cmd');
    if (cmdText) {
      try {
        await navigator.clipboard.writeText(cmdText);
        // Show temporary checkmark feedback on copy icon
        const img = btn.querySelector('img');
        if (img) {
          const originalSrc = img.src;
          const originalFilter = img.style.filter;
          img.src = "https://img.icons8.com/ios-filled/100/checkmark--v1.png";
          img.style.filter = "invert(48%) sepia(97%) saturate(583%) hue-rotate(113deg) brightness(95%) contrast(98%)"; // Green
          setTimeout(() => {
            img.src = originalSrc;
            img.style.filter = originalFilter;
          }, 1000);
        }
      } catch (err) {
        console.error("Failed to copy command:", err);
      }
    }
  }
});

// Synchronize Countdown Dropdown UI with localDb state
function syncCountdownUI() {
  const duration = localDb && localDb.settings && localDb.settings.countdownDuration !== undefined
    ? parseInt(localDb.settings.countdownDuration, 10)
    : 5;

  const countdownValue = document.getElementById('countdown-value');
  if (countdownValue) {
    countdownValue.innerText = duration === 0 ? 'Immediately' : `${duration}s`;
    countdownValue.setAttribute('data-selected-value', duration.toString());
  }

  const options = document.querySelectorAll('.countdown-option');
  options.forEach(opt => {
    const optVal = parseInt(opt.getAttribute('data-value'), 10);
    const checkIcon = opt.querySelector('.checkmark-icon');
    if (optVal === duration) {
      if (checkIcon) checkIcon.classList.remove('hidden');
    } else {
      if (checkIcon) checkIcon.classList.add('hidden');
    }
  });
}

// Settings Modal Interaction
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsModalBtn = document.getElementById('close-settings-modal-btn');
const invisibleModeToggle = document.getElementById('invisible-mode-toggle');
const countdownDropdown = document.getElementById('countdown-dropdown');
const countdownOptions = document.getElementById('countdown-options');
const countdownArrow = document.getElementById('countdown-arrow');
const countdownValue = document.getElementById('countdown-value');
const settingsAppVersion = document.getElementById('settings-app-version');

if (settingsAppVersion && ipcRenderer) {
  ipcRenderer.invoke('get-app-version').then(ver => {
    if (ver) {
      settingsAppVersion.textContent = `Ciyper v${ver}`;
    }
  }).catch(() => {});
}

function hideCountdownOptions() {
  if (countdownOptions) {
    countdownOptions.classList.add('hidden');
    countdownOptions.classList.remove('flex');
  }
  if (countdownArrow) {
    countdownArrow.style.transform = '';
  }
}

if (settingsBtn && settingsModal) {
  settingsBtn.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
    settingsModal.classList.add('flex');
    if (invisibleModeToggle && localDb && localDb.settings) {
      const isInv = localDb.settings.invisibleMode !== undefined ? !!localDb.settings.invisibleMode : true;
      invisibleModeToggle.checked = isInv;
    }
    syncCountdownUI();
  });
}

if (countdownDropdown && countdownOptions && countdownArrow) {
  countdownDropdown.addEventListener('click', (e) => {
    e.stopPropagation();
    const isHidden = countdownOptions.classList.contains('hidden');
    if (isHidden) {
      countdownOptions.classList.remove('hidden');
      countdownOptions.classList.add('flex');
      countdownArrow.style.transform = 'rotate(180deg)';
    } else {
      hideCountdownOptions();
    }
  });

  document.addEventListener('click', (e) => {
    if (!countdownDropdown.contains(e.target) && !countdownOptions.contains(e.target)) {
      hideCountdownOptions();
    }
  });

  const options = countdownOptions.querySelectorAll('.countdown-option');
  options.forEach(opt => {
    opt.addEventListener('click', async (e) => {
      e.stopPropagation();
      const val = parseInt(opt.getAttribute('data-value'), 10);

      if (countdownValue) {
        countdownValue.innerText = val === 0 ? 'Immediately' : `${val}s`;
        countdownValue.setAttribute('data-selected-value', val.toString());
      }

      options.forEach(o => {
        const oVal = parseInt(o.getAttribute('data-value'), 10);
        const cIcon = o.querySelector('.checkmark-icon');
        if (oVal === val) {
          if (cIcon) cIcon.classList.remove('hidden');
        } else {
          if (cIcon) cIcon.classList.add('hidden');
        }
      });

      hideCountdownOptions();

      const updatedDb = await ipcRenderer.invoke('save-countdown-duration', val);
      if (updatedDb) {
        localDb = updatedDb;
      }
    });
  });
}

if (closeSettingsModalBtn && settingsModal) {
  closeSettingsModalBtn.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    settingsModal.classList.remove('flex');
    hideCountdownOptions();
  });
}

if (settingsModal) {
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) {
      settingsModal.classList.add('hidden');
      settingsModal.classList.remove('flex');
      hideCountdownOptions();
    }
  });
}

// API Key Required Modal Interaction
const apiKeyModal = document.getElementById('api-key-modal');
const closeApiKeyModalBtn = document.getElementById('close-api-key-modal-btn');
const goToApiKeysBtn = document.getElementById('go-to-api-keys-btn');

if (closeApiKeyModalBtn && apiKeyModal) {
  closeApiKeyModalBtn.addEventListener('click', () => {
    apiKeyModal.classList.add('hidden');
    apiKeyModal.classList.remove('flex');
  });
}

if (goToApiKeysBtn && apiKeyModal) {
  goToApiKeysBtn.addEventListener('click', () => {
    apiKeyModal.classList.add('hidden');
    apiKeyModal.classList.remove('flex');
    if (tabKeys) tabKeys.click();
    if (apiKeyInput) {
      apiKeyInput.focus();
    }
  });
}

if (apiKeyModal) {
  apiKeyModal.addEventListener('click', (e) => {
    if (e.target === apiKeyModal) {
      apiKeyModal.classList.add('hidden');
      apiKeyModal.classList.remove('flex');
    }
  });
}

if (invisibleModeToggle) {
  invisibleModeToggle.addEventListener('change', async (e) => {
    const enable = e.target.checked;
    const updatedDb = await ipcRenderer.invoke('toggle-invisible-mode', enable);
    if (updatedDb) {
      localDb = updatedDb;
    }
  });
}

// IPC listener to sync the Invisible Mode checkbox state dynamically
ipcRenderer.on('invisible-mode-changed', (event, { enable }) => {
  if (localDb) {
    localDb.settings.invisibleMode = enable;
  }
  if (invisibleModeToggle) {
    invisibleModeToggle.checked = enable;
  }
});

// Launch database load on script parse
loadDbData();
