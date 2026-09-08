const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');

let autoUpdater = null;
try {
  autoUpdater = require('electron-updater').autoUpdater;
} catch (err) {
  console.warn('[AutoUpdater] Módulo electron-updater não encontrado ou indisponível:', err?.message || err);
}

let mainWindow;
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// Configuração do Auto Updater (GitHub Releases)
if (autoUpdater) {
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
}

function setupAutoUpdater() {
  if (!autoUpdater) {
    console.log('[AutoUpdater] autoUpdater não inicializado.');
    return;
  }
  if (isDev) {
    console.log('[AutoUpdater] Modo de desenvolvimento - verificações de release desativadas.');
    return;
  }

  autoUpdater.on('checking-for-update', () => {
    console.log('[AutoUpdater] Verificando se há atualizações disponíveis no GitHub...');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', 'checking');
    }
  });

  autoUpdater.on('update-available', (info) => {
    console.log('[AutoUpdater] Nova versão encontrada:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', 'available', info);
    }
  });

  autoUpdater.on('update-not-available', () => {
    console.log('[AutoUpdater] Aplicativo já está na versão mais recente.');
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', 'not-available');
    }
  });

  autoUpdater.on('download-progress', (progressObj) => {
    const percent = Math.round(progressObj.percent);
    console.log(`[AutoUpdater] Baixando atualização: ${percent}%`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-progress', percent);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    console.log('[AutoUpdater] Atualização baixada com sucesso. Versão:', info.version);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', 'downloaded', info);
    }

    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: 'Atualização Pronta!',
        message: `Uma nova versão (${info.version}) do Phone Center foi baixada.`,
        detail: 'Deseja reiniciar o aplicativo agora para aplicar as atualizações?',
        buttons: ['Reiniciar Agora', 'Depois'],
        defaultId: 0,
        cancelId: 1,
      })
      .then((returnValue) => {
        if (returnValue.response === 0) {
          autoUpdater.quitAndInstall(false, true);
        }
      });
  });

  autoUpdater.on('error', (err) => {
    console.warn('[AutoUpdater] Erro ao verificar ou baixar atualização:', err?.message || err);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater-status', 'error', err?.message);
    }
  });

  // Executa checagem de atualização 5 segundos após abrir o app
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch((err) => {
      console.warn('[AutoUpdater] Falha silenciosa ao checar updates:', err?.message);
    });
  }, 5000);
}

function createWindow() {
  const iconPath = process.platform === 'win32'
    ? path.join(__dirname, 'icon.ico')
    : path.join(__dirname, 'icon.png');

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 650,
    title: 'Phone Center — Sistema de Gestão',
    icon: iconPath,
    backgroundColor: '#09090b',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    show: false,
  });

  if (!isDev) {
    Menu.setApplicationMenu(null);
  }

  const targetUrl = isDev ? APP_URL : (process.env.PRODUCTION_URL || 'https://app.phonecenter.tech');
  
  mainWindow.loadURL(targetUrl).catch((err) => {
    console.log('[Electron] Falha ao carregar URL remota, tentando recarregar...', err?.message);
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.loadURL('https://app.phonecenter.tech').catch(() => {});
      }
    }, 3000);
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    setupAutoUpdater();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('check-updates-manually', async () => {
  if (!isDev && autoUpdater) {
    return autoUpdater.checkForUpdates();
  }
  return { status: 'disabled_or_dev' };
});

ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});
