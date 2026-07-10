const { app, BrowserWindow, screen, ipcMain, session, desktopCapturer, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;
let sessionsWindow;

// Local JSON Database Configuration
let dbPath;

function initDatabase() {
  if (!dbPath) {
    dbPath = path.join(app.getPath('userData'), 'database.json');
  }
  if (!fs.existsSync(dbPath)) {
    const oldDbPath = path.join(app.getPath('appData'), 'floating-ai-chat-panel', 'database.json');
    if (fs.existsSync(oldDbPath)) {
      try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.copyFileSync(oldDbPath, dbPath);
        console.log("Database migrated successfully from floating-ai-chat-panel to co-assist-ai");
      } catch (err) {
        console.error("Failed to migrate database:", err);
      }
    }
  }
  if (!fs.existsSync(dbPath)) {
    const defaultDb = {
      settings: {
        apiKey: "",
        apiKeyBackup1: "",
        apiKeyBackup2: "",
        resume: {
          fileName: "",
          content: ""
        },
        contexts: [],
        rules: []
      },
      apiUsageHistory: {
        primary: {},
        backup1: {},
        backup2: {}
      },
      sessions: []
    };
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(dbPath, JSON.stringify(defaultDb, null, 2), 'utf-8');
  }
}

function readDatabase() {
  initDatabase();
  try {
    const data = fs.readFileSync(dbPath, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error("Failed to read database:", e);
    return {
      settings: { apiKey: "", resume: { fileName: "", content: "" }, contexts: [], rules: [] },
      sessions: []
    };
  }
}

function writeDatabase(db) {
  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e) {
    console.error("Failed to write to database:", e);
  }
}

function createSessionsWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 800;
  const windowHeight = 700;

  // Center on screen
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = Math.round((screenHeight - windowHeight) / 2);

  sessionsWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    }
  });

  sessionsWindow.loadFile('co-assist_ai_landing.html');
  sessionsWindow.webContents.openDevTools();

  sessionsWindow.once('ready-to-show', () => {
    sessionsWindow.show();
  });
}

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width: screenWidth, height: screenHeight } = primaryDisplay.bounds;

  const windowWidth = 720;
  const windowHeight = 60; // Start collapsed (pill shape)

  // Calculate coordinates to place it top-center
  const x = Math.round((screenWidth - windowWidth) / 2);
  const y = 80; // 80px from the top of the screen

  mainWindow = new BrowserWindow({
    width: windowWidth,
    height: windowHeight,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      devTools: true
    }
  });

  mainWindow.loadFile('co-assist_ai_session.html');
  mainWindow.webContents.openDevTools();

  // Avoid visual flashing on load
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window focus and blur
  mainWindow.on('blur', () => {
    // Optionally hide when user clicks away
    // mainWindow.hide();
  });
}

app.whenReady().then(() => {
  // Automatically grant permission and select the screen/audio source requested by renderer
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    callback({
      video: request.videoRequested,
      audio: request.audioRequested
    });
  });

  createSessionsWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createSessionsWindow();
  });
});

ipcMain.on('start-session', () => {
  createWindow();
  if (sessionsWindow) {
    sessionsWindow.close();
    sessionsWindow = null;
  }
});

ipcMain.on('end-session', (event, { duration, title }) => {
  const db = readDatabase();
  let finalTitle = title || "Empty Session";
  if (finalTitle === "Empty Session") {
    const emptyCount = db.sessions.filter(s => s.name.startsWith("Empty Session")).length + 1;
    finalTitle = `Empty Session #${emptyCount}`;
  }
  const sessionItem = {
    id: Date.now().toString(),
    name: finalTitle,
    duration: duration,
    date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  };
  db.sessions.unshift(sessionItem);
  writeDatabase(db);

  createSessionsWindow();
  if (mainWindow) {
    mainWindow.close();
    mainWindow = null;
  }
});

ipcMain.handle('delete-session', async (event, id) => {
  const db = readDatabase();
  db.sessions = db.sessions.filter(s => s.id !== id);
  writeDatabase(db);
  return db;
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

// IPC handlers for window control
ipcMain.on('close-window', () => {
  app.quit();
});

ipcMain.on('minimize-window', () => {
  if (mainWindow) mainWindow.minimize();
});

ipcMain.handle('get-desktop-sources', async () => {
  return await desktopCapturer.getSources({ types: ['screen', 'window'] });
});

ipcMain.on('resize-window', (event, { width, height, animate }) => {
  if (mainWindow) {
    const [currentX, currentY] = mainWindow.getPosition();
    const [currentWidth] = mainWindow.getSize();
    
    // Keep window centered relative to its current horizontal center when resizing width
    const newX = currentX + Math.round((currentWidth - width) / 2);
    
    mainWindow.setBounds({
      x: newX,
      y: currentY,
      width: width,
      height: height
    }, animate !== false); // Default to true if not explicitly set to false
  }
});

// Database IPC Communication Handlers
ipcMain.handle('get-db-data', () => {
  return readDatabase();
});

ipcMain.on('save-api-key', (event, { type, key }) => {
  const db = readDatabase();
  if (type === 'primary') db.settings.apiKey = key;
  else if (type === 'backup1') db.settings.apiKeyBackup1 = key;
  else if (type === 'backup2') db.settings.apiKeyBackup2 = key;
  
  if (!db.keyStatuses) {
    db.keyStatuses = { primary: "unused", backup1: "unused", backup2: "unused" };
  }
  db.keyStatuses[type] = key ? "healthy" : "unused";

  writeDatabase(db);
  event.reply('save-api-key-success', { type });
});

ipcMain.on('set-key-status', (event, { keyType, status }) => {
  const db = readDatabase();
  if (!db.keyStatuses) {
    db.keyStatuses = { primary: "unused", backup1: "unused", backup2: "unused" };
  }
  db.keyStatuses[keyType] = status;
  writeDatabase(db);
});

ipcMain.on('increment-api-usage', (event, { keyType }) => {
  const db = readDatabase();
  if (!db.apiUsageHistory) {
    db.apiUsageHistory = { primary: {}, backup1: {}, backup2: {} };
  }
  if (!db.apiUsageHistory[keyType]) {
    db.apiUsageHistory[keyType] = {};
  }
  const today = new Date().toISOString().split('T')[0];
  db.apiUsageHistory[keyType][today] = (db.apiUsageHistory[keyType][today] || 0) + 1;
  writeDatabase(db);
});

ipcMain.handle('upload-file', async (event, type) => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  const db = readDatabase();
  if (type === 'resume') {
    db.settings.resume = { fileName, content };
  } else if (type === 'context') {
    if (!db.settings.contexts.some(c => c.fileName === fileName)) {
      db.settings.contexts.push({ id: Date.now().toString(), fileName, content });
    }
  } else if (type === 'rules') {
    if (!db.settings.rules.some(r => r.fileName === fileName)) {
      db.settings.rules.push({ id: Date.now().toString(), fileName, content });
    }
  }

  writeDatabase(db);
  return db;
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Text Files', extensions: ['txt'] }]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');
  return { fileName, content };
});

ipcMain.handle('save-resume', async (event, resumeData) => {
  const db = readDatabase();
  db.settings.resume = resumeData;
  writeDatabase(db);
  return db;
});

ipcMain.handle('delete-file', async (event, { type, id }) => {
  const db = readDatabase();
  if (type === 'resume') {
    db.settings.resume = { fileName: "", content: "" };
  } else if (type === 'context') {
    db.settings.contexts = db.settings.contexts.filter(c => c.id !== id);
  } else if (type === 'rules') {
    db.settings.rules = db.settings.rules.filter(r => r.id !== id);
  }

  writeDatabase(db);
  return db;
});

ipcMain.on('save-session', (event, sessionItem) => {
  const db = readDatabase();
  db.sessions.push(sessionItem);
  writeDatabase(db);
});

