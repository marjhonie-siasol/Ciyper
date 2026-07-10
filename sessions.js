const { ipcRenderer } = require('electron');

// DOM Elements
const startSessionBtn = document.getElementById('start-session-btn');
const closeBtn = document.getElementById('close-btn');

// Main Tab buttons & panels
const tabRecent = document.getElementById('tab-recent');
const tabFiles = document.getElementById('tab-files');
const tabKeys = document.getElementById('tab-keys');
const panelRecent = document.getElementById('panel-recent');
const panelFiles = document.getElementById('panel-files');
const panelKeys = document.getElementById('panel-keys');

// Subtab buttons inside My Files
const subtabContext = document.getElementById('subtab-context');
const subtabRules = document.getElementById('subtab-rules');

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
      startSessionBtn.innerText = "Start Session";
      startSessionBtn.style.backgroundColor = "#FFFFFF";
      startSessionBtn.style.color = "#131313";
      return;
    }

    // Validate if at least the Primary API key is present
    if (!localDb || !localDb.settings.apiKey) {
      alert("Please enter and save a Primary Gemini API Key first!");
      return;
    }

    // Start countdown state
    secondsLeft = 5;
    
    // Change button styles to a darker cancel theme
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
        startSessionBtn.innerText = "Launching...";
        ipcRenderer.send('start-session');
      }
    }, 1000);
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
    saveKeyBtn.innerText = "Delete";
  } else {
    apiKeyInput.value = "";
    apiKeyInput.readOnly = false;
    saveKeyBtn.innerText = "Save";
  }

  // 2. Render Backup 1 API Key
  if (localDb.settings.apiKeyBackup1) {
    apiKeyInputBackup1.value = localDb.settings.apiKeyBackup1;
    apiKeyInputBackup1.readOnly = true;
    saveKeyBtnBackup1.innerText = "Delete";
  } else {
    apiKeyInputBackup1.value = "";
    apiKeyInputBackup1.readOnly = false;
    saveKeyBtnBackup1.innerText = "Save";
  }

  // 3. Render Backup 2 API Key
  if (localDb.settings.apiKeyBackup2) {
    apiKeyInputBackup2.value = localDb.settings.apiKeyBackup2;
    apiKeyInputBackup2.readOnly = true;
    saveKeyBtnBackup2.innerText = "Delete";
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
    addResumeBtn.innerText = "Delete";
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

  // 5. Render Sessions list
  panelRecent.innerHTML = "";
  if (localDb.sessions && localDb.sessions.length > 0) {
    localDb.sessions.forEach(sess => {
      const row = document.createElement('div');
      row.className = "flex items-center justify-between py-2 min-w-0 overflow-hidden";
      
      row.innerHTML = `
        <span class="text-sm font-normal truncate pr-4 min-w-0 flex-grow" title="${sess.name}">${sess.name}</span>
        <div class="flex items-center space-x-4 flex-shrink-0">
          <span class="text-xs bg-gray-800 text-gray-400 px-3 py-1 rounded-full font-medium">${sess.duration}</span>
          <span class="text-xs text-gray-400 font-medium">${sess.date}</span>
          <button class="delete-session-btn hover:text-red-500 transition-all p-1 flex-shrink-0" data-id="${sess.id}" title="Delete Session">
            <img src="https://img.icons8.com/fluency-systems-regular/96/FA5252/trash--v1.png" alt="delete" class="w-4 h-4 opacity-75 hover:opacity-100">
          </button>
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
      fileRow.className = "flex items-center justify-between py-1.5 min-w-0 overflow-hidden";
      
      const nameSpan = document.createElement('span');
      nameSpan.className = "text-xs font-normal text-gray-200 truncate pr-2 min-w-0";
      nameSpan.innerText = file.fileName;
      fileRow.appendChild(nameSpan);

      const delBtn = document.createElement('button');
      delBtn.className = "hover:text-red-500 transition-all p-1 flex-shrink-0";
      delBtn.innerHTML = `<img src="https://img.icons8.com/fluency-systems-regular/96/FA5252/trash--v1.png" alt="delete" class="w-4 h-4 opacity-75 hover:opacity-100">`;
      delBtn.addEventListener('click', async () => {
        localDb = await ipcRenderer.invoke('delete-file', { type: activeSubtab, id: file.id });
        renderUI();
      });
      fileRow.appendChild(delBtn);

      filesListContainer.appendChild(fileRow);
    });
  } else {
    filesListContainer.innerHTML = `<div class="text-xs text-gray-500 text-center py-6">No files added yet</div>`;
  }

  // Always refresh analytics charts
  renderAnalytics();
}

// Save / Delete API Key Event Handlers
if (saveKeyBtn) {
  saveKeyBtn.addEventListener('click', () => {
    const btnText = saveKeyBtn.innerText;
    if (btnText === "Save") {
      const key = apiKeyInput.value.trim();
      if (!key) { alert("Please enter a valid API Key first!"); return; }
      ipcRenderer.send('save-api-key', { type: 'primary', key });
    } else if (btnText === "Delete") {
      ipcRenderer.send('save-api-key', { type: 'primary', key: "" });
    }
  });
}

if (saveKeyBtnBackup1) {
  saveKeyBtnBackup1.addEventListener('click', () => {
    const btnText = saveKeyBtnBackup1.innerText;
    if (btnText === "Save") {
      const key = apiKeyInputBackup1.value.trim();
      if (!key) { alert("Please enter a valid API Key first!"); return; }
      ipcRenderer.send('save-api-key', { type: 'backup1', key });
    } else if (btnText === "Delete") {
      ipcRenderer.send('save-api-key', { type: 'backup1', key: "" });
    }
  });
}

if (saveKeyBtnBackup2) {
  saveKeyBtnBackup2.addEventListener('click', () => {
    const btnText = saveKeyBtnBackup2.innerText;
    if (btnText === "Save") {
      const key = apiKeyInputBackup2.value.trim();
      if (!key) { alert("Please enter a valid API Key first!"); return; }
      ipcRenderer.send('save-api-key', { type: 'backup2', key });
    } else if (btnText === "Delete") {
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
    } else if (btnText === "Delete") {
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
if (tabRecent && tabFiles && tabKeys && panelRecent && panelFiles && panelKeys) {
  tabRecent.addEventListener('click', () => {
    tabRecent.classList.add('active');
    tabFiles.classList.remove('active');
    tabKeys.classList.remove('active');
    panelRecent.classList.remove('hidden');
    panelFiles.classList.add('hidden');
    panelKeys.classList.add('hidden');
    if (keysInfoBtn) keysInfoBtn.classList.add('hidden');
    if (filesInfoBtn) filesInfoBtn.classList.add('hidden');
    if (recentInfoBtn) recentInfoBtn.classList.remove('hidden');
  });

  tabFiles.addEventListener('click', () => {
    tabFiles.classList.add('active');
    tabRecent.classList.remove('active');
    tabKeys.classList.remove('active');
    panelFiles.classList.remove('hidden');
    panelFiles.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelKeys.classList.add('hidden');
    if (keysInfoBtn) keysInfoBtn.classList.add('hidden');
    if (filesInfoBtn) filesInfoBtn.classList.remove('hidden');
    if (recentInfoBtn) recentInfoBtn.classList.add('hidden');
  });

  tabKeys.addEventListener('click', () => {
    tabKeys.classList.add('active');
    tabRecent.classList.remove('active');
    tabFiles.classList.remove('active');
    panelKeys.classList.remove('hidden');
    panelKeys.classList.add('flex');
    panelRecent.classList.add('hidden');
    panelFiles.classList.add('hidden');
    if (keysInfoBtn) keysInfoBtn.classList.remove('hidden');
    if (filesInfoBtn) filesInfoBtn.classList.add('hidden');
    if (recentInfoBtn) recentInfoBtn.classList.add('hidden');
  });
}

// My Files Subtabs Navigation Logic
if (subtabContext && subtabRules) {
  const activeSubtabClasses = ['border-b-2', 'border-white', 'text-white'];
  const inactiveSubtabClasses = ['text-gray-400'];

  subtabContext.addEventListener('click', () => {
    activeSubtab = 'context';
    subtabContext.classList.add(...activeSubtabClasses);
    subtabContext.classList.remove(...inactiveSubtabClasses);
    subtabRules.classList.remove(...activeSubtabClasses);
    subtabRules.classList.add(...inactiveSubtabClasses);
    renderUI();
  });

  subtabRules.addEventListener('click', () => {
    activeSubtab = 'rules';
    subtabRules.classList.add(...activeSubtabClasses);
    subtabRules.classList.remove(...inactiveSubtabClasses);
    subtabContext.classList.remove(...activeSubtabClasses);
    subtabContext.classList.add(...inactiveSubtabClasses);
    renderUI();
  });
}

// API Key Information Modal Logic
const analyticsInfoBtn = document.getElementById('analytics-info-btn');
const analyticsInfoModal = document.getElementById('analytics-info-modal');
const analyticsModalOkBtn = document.getElementById('analytics-modal-ok-btn');

const keysInfoBtn = document.getElementById('keys-info-btn');
const keysInfoModal = document.getElementById('keys-info-modal');
const keysModalOkBtn = document.getElementById('keys-modal-ok-btn');

const filesInfoBtn = document.getElementById('files-info-btn');
const filesInfoModal = document.getElementById('files-info-modal');
const filesModalOkBtn = document.getElementById('files-modal-ok-btn');

const recentInfoBtn = document.getElementById('recent-info-btn');
const recentInfoModal = document.getElementById('recent-info-modal');
const recentModalOkBtn = document.getElementById('recent-modal-ok-btn');

if (analyticsInfoBtn && analyticsInfoModal) {
  analyticsInfoBtn.addEventListener('click', () => {
    analyticsInfoModal.classList.remove('hidden');
  });
}
if (analyticsInfoModal) {
  const hideAnalyticsModal = () => { analyticsInfoModal.classList.add('hidden'); };
  if (analyticsModalOkBtn) analyticsModalOkBtn.addEventListener('click', hideAnalyticsModal);
  analyticsInfoModal.addEventListener('click', (e) => {
    if (e.target === analyticsInfoModal) hideAnalyticsModal();
  });
}

if (keysInfoBtn && keysInfoModal) {
  keysInfoBtn.addEventListener('click', () => {
    keysInfoModal.classList.remove('hidden');
  });
}
if (keysInfoModal) {
  const hideKeysModal = () => { keysInfoModal.classList.add('hidden'); };
  if (keysModalOkBtn) keysModalOkBtn.addEventListener('click', hideKeysModal);
  keysInfoModal.addEventListener('click', (e) => {
    if (e.target === keysInfoModal) hideKeysModal();
  });
}

if (filesInfoBtn && filesInfoModal) {
  filesInfoBtn.addEventListener('click', () => {
    filesInfoModal.classList.remove('hidden');
  });
}
if (filesInfoModal) {
  const hideFilesModal = () => { filesInfoModal.classList.add('hidden'); };
  if (filesModalOkBtn) filesModalOkBtn.addEventListener('click', hideFilesModal);
  filesInfoModal.addEventListener('click', (e) => {
    if (e.target === filesInfoModal) hideFilesModal();
  });
}

if (recentInfoBtn && recentInfoModal) {
  recentInfoBtn.addEventListener('click', () => {
    recentInfoModal.classList.remove('hidden');
  });
}
if (recentInfoModal) {
  const hideRecentModal = () => { recentInfoModal.classList.add('hidden'); };
  if (recentModalOkBtn) recentModalOkBtn.addEventListener('click', hideRecentModal);
  recentInfoModal.addEventListener('click', (e) => {
    if (e.target === recentInfoModal) hideRecentModal();
  });
}

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
      statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400 border border-gray-700";
      statusBadge.innerText = "Unused";
    } else if (finalStatus === "rate-limited") {
      statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-yellow-950 bg-opacity-35 text-yellow-400 border border-yellow-700";
      statusBadge.innerText = "Rate Limited";
    } else if (finalStatus === "invalid") {
      statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-red-950 bg-opacity-35 text-red-400 border border-red-700";
      statusBadge.innerText = "Invalid";
    } else {
      statusBadge.className = "text-xs px-2 py-0.5 rounded-full bg-green-900 bg-opacity-35 text-green-400 border border-green-700";
      statusBadge.innerText = "Healthy";
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
      
      // Native tooltip content
      const titleText = `${new Date(p.day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: ${p.count} queries`;
      const title = document.createElementNS(svgNamespace, "title");
      title.textContent = titleText;
      circle.appendChild(title);
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

// Launch database load on script parse
loadDbData();
