import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';

// Client IDs e secrets configuráveis via interface
let TWITCH_CLIENT_ID = '';
let YOUTUBE_CLIENT_ID = '';
let YOUTUBE_CLIENT_SECRET = '';
const REDIRECT_URI = 'http://localhost';

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: true,
      contextIsolation: false, // Permitir require no React para IPC
      webSecurity: false, // Necessário para exibir vídeos do diretório local via file:///
    },
    autoHideMenuBar: true,
    backgroundColor: '#121212',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

// IPC para receber Client IDs e secrets da interface
ipcMain.handle('save-client-ids', async (_event, { twitchId, youtubeId, youtubeSecret }) => {
  if (twitchId !== undefined) TWITCH_CLIENT_ID = twitchId;
  if (youtubeId !== undefined) YOUTUBE_CLIENT_ID = youtubeId;
  if (youtubeSecret !== undefined) YOUTUBE_CLIENT_SECRET = youtubeSecret;
  return true;
});

// IPC para Fluxo OAuth da Twitch
ipcMain.handle('login-twitch', async () => {
  if (!TWITCH_CLIENT_ID) {
    throw new Error('Client ID da Twitch não configurado. Preencha nas Configurações.');
  }
  return new Promise((resolve, reject) => {
    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      show: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    });

    const authUrl = `https://id.twitch.tv/oauth2/authorize?client_id=${TWITCH_CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=token&scope=user:read:email`;

    authWindow.loadURL(authUrl);

    let isResolved = false;

    const checkUrl = (urlStr) => {
      if (urlStr.startsWith(REDIRECT_URI)) {
        const hash = urlStr.split('#')[1];
        if (hash) {
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          if (accessToken) {
            isResolved = true;
            resolve(accessToken);
            authWindow.close();
            return true;
          }
        }
        if (!isResolved) {
          isResolved = true;
          reject('Falha ao autenticar.');
          authWindow.close();
        }
        return true;
      }
      return false;
    };

    authWindow.webContents.on('will-redirect', (event, newUrl) => {
      if (checkUrl(newUrl)) {
        event.preventDefault();
      }
    });

    authWindow.webContents.on('did-navigate', (event, newUrl) => {
      checkUrl(newUrl);
    });

    authWindow.on('closed', () => {
      if (!isResolved) {
        reject('O usuário fechou a janela de login.');
      }
    });
  });
});

// IPC para Fluxo OAuth do YouTube (Authorization Code Flow via servidor local)
ipcMain.handle('login-youtube', async () => {
  if (!YOUTUBE_CLIENT_ID) {
    throw new Error('Client ID do YouTube não configurado. Preencha nas Configurações.');
  }

  const http = (await import('http')).default;
  const YOUTUBE_REDIRECT_URI = 'http://localhost:8080';

  return new Promise((resolve, reject) => {
    let server = null;
    let authWindow = null; // declarado aqui para ser visível em todos os callbacks
    let isResolved = false;

    const cleanup = () => {
      try { server && server.close(); } catch {}
      try { authWindow && !authWindow.isDestroyed() && authWindow.close(); } catch {}
    };

    // Servidor temporário para capturar o código de autorização
    server = http.createServer((req, res) => {
      const urlObj = new URL(req.url, YOUTUBE_REDIRECT_URI);
      const code = urlObj.searchParams.get('code');
      const error = urlObj.searchParams.get('error');

      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<h2 style="font-family:sans-serif;text-align:center;margin-top:80px">✅ Autenticado! Pode fechar esta aba.</h2>');

      if (error || !code) {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject(`Erro na autenticação do YouTube: ${error || 'código não recebido'}`);
        }
        return;
      }

      if (!isResolved) {
        isResolved = true;
        cleanup();
        // Troca o authorization code por um access_token
        fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: YOUTUBE_CLIENT_ID,
            client_secret: YOUTUBE_CLIENT_SECRET,
            redirect_uri: YOUTUBE_REDIRECT_URI,
            grant_type: 'authorization_code',
          }).toString(),
        })
          .then(r => r.json())
          .then(data => {
            if (data.access_token) {
              resolve(data.access_token);
            } else {
              reject('Token não recebido: ' + JSON.stringify(data));
            }
          })
          .catch(err => reject('Falha ao trocar código por token: ' + err.message));
      }
    });

    server.listen(8080, '127.0.0.1', () => {
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${YOUTUBE_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(YOUTUBE_REDIRECT_URI)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent('https://www.googleapis.com/auth/youtube.readonly')}` +
        `&access_type=offline` +
        `&prompt=consent`;

      // atribui à variável do escopo externo
      authWindow = new BrowserWindow({
        width: 520,
        height: 720,
        show: true,
        webPreferences: { nodeIntegration: false, contextIsolation: true }
      });

      authWindow.loadURL(authUrl);

      authWindow.on('closed', () => {
        if (!isResolved) {
          isResolved = true;
          cleanup();
          reject('O usuário fechou a janela de login do YouTube.');
        }
      });
    });

    server.on('error', (err) => {
      if (!isResolved) {
        isResolved = true;
        reject('Falha ao iniciar servidor local OAuth: ' + err.message);
      }
    });
  });
});

import fs from 'fs';
import { dialog } from 'electron';

// IPC para Ler Pasta Local
ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return [];
  }

  const folderPath = result.filePaths[0];
  const files = fs.readdirSync(folderPath);
  
  // Filtra apenas arquivos de vídeo comuns
  const videoExts = ['.mp4', '.mkv', '.avi', '.webm', '.mov'];
  const videoFiles = files.filter(f => videoExts.includes(path.extname(f).toLowerCase()));

  return videoFiles.map(file => {
    return {
      name: file,
      path: `file:///${path.join(folderPath, file).replace(/\\/g, '/')}`,
    };
  });
});

// ==========================================
// Persistência Local (JSON)
// ==========================================
const getDataFilePath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'streamtv-data.json');
};

ipcMain.handle('save-data', async (_event, data) => {
  try {
    const filePath = getDataFilePath();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return { success: true, path: filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('load-data', async () => {
  try {
    const filePath = getDataFilePath();
    if (!fs.existsSync(filePath)) {
      return { success: true, data: null }; // Primeira execução
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return { success: true, data: JSON.parse(raw) };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ==========================================
// RTMP Streaming via FFmpeg
// ==========================================
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { spawn } from 'child_process';

let ffmpegProcess = null;
let streamStatus = 'idle'; // idle | streaming | error
let currentRtmpUrl = '';

const getFfmpegPath = () => {
  try {
    return require('ffmpeg-static');
  } catch {
    return 'ffmpeg';
  }
};

const killFfmpeg = () => {
  return new Promise((resolve) => {
    if (!ffmpegProcess) return resolve();
    const proc = ffmpegProcess;
    ffmpegProcess = null;
    try { proc.stdin.write('q'); } catch {}
    setTimeout(() => {
      try { proc.kill('SIGTERM'); } catch {}
      resolve();
    }, 1500);
  });
};

const spawnFfmpeg = (args) => {
  const ffmpegPath = getFfmpegPath();
  ffmpegProcess = spawn(ffmpegPath, args);
  streamStatus = 'streaming';

  ffmpegProcess.stderr.on('data', (data) => {
    console.log('[FFmpeg]', data.toString().substring(0, 200));
  });

  ffmpegProcess.on('error', (err) => {
    console.error('[FFmpeg] Erro:', err.message);
    streamStatus = 'error';
    ffmpegProcess = null;
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-status', { status: 'error', message: err.message }));
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`[FFmpeg] Encerrado (code ${code})`);
    // Só marca como idle se não foi uma troca de stream
    if (ffmpegProcess === null) {
      streamStatus = 'idle';
      BrowserWindow.getAllWindows().forEach(w => w.webContents.send('stream-status', { status: 'idle', code }));
    }
  });
};

const buildVideoArgs = (filePath, offsetSeconds, fullRtmpUrl) => [
  '-re',
  '-ss', String(Math.floor(offsetSeconds)),
  '-i', filePath,
  '-c:v', 'libx264', '-preset', 'veryfast',
  '-maxrate', '3000k', '-bufsize', '6000k',
  '-pix_fmt', 'yuv420p', '-g', '60',
  '-c:a', 'aac', '-b:a', '128k', '-ar', '44100',
  '-f', 'flv', fullRtmpUrl
];

const buildScreensaverArgs = (fullRtmpUrl) => [
  '-re',
  '-f', 'lavfi', '-i',
  'color=c=#1a1a2e:s=1920x1080:r=30,drawtext=text=StreamTV:fontsize=80:fontcolor=white@0.6:x=(w-text_w)/2:y=(h-text_h)/2',
  '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo',
  '-c:v', 'libx264', '-preset', 'veryfast',
  '-maxrate', '2000k', '-bufsize', '4000k',
  '-pix_fmt', 'yuv420p', '-g', '60',
  '-c:a', 'aac', '-b:a', '128k',
  '-t', '86400',  // Até 24h (será interrompido antes)
  '-f', 'flv', fullRtmpUrl
];

const resolveFilePath = (videoPath) => {
  let filePath = videoPath;
  if (filePath.startsWith('file:///')) {
    filePath = filePath.replace('file:///', '');
    if (process.platform === 'win32') {
      filePath = filePath.replace(/\//g, '\\');
    }
  }
  return filePath;
};

// Iniciar stream (vídeo ou screensaver)
ipcMain.handle('start-stream', async (_event, { videoPath, offsetSeconds, rtmpUrl, streamKey, mode }) => {
  if (ffmpegProcess) {
    return { success: false, error: 'Já existe uma transmissão ativa.' };
  }

  const fullRtmpUrl = `${rtmpUrl}/${streamKey}`;
  currentRtmpUrl = fullRtmpUrl;

  let args;
  if (mode === 'screensaver' || !videoPath) {
    args = buildScreensaverArgs(fullRtmpUrl);
  } else {
    const filePath = resolveFilePath(videoPath);
    args = buildVideoArgs(filePath, offsetSeconds, fullRtmpUrl);
  }

  try {
    spawnFfmpeg(args);
    return { success: true };
  } catch (err) {
    streamStatus = 'error';
    return { success: false, error: err.message };
  }
});

// Trocar fonte do stream sem parar (vídeo <-> screensaver)
ipcMain.handle('switch-stream', async (_event, { videoPath, offsetSeconds }) => {
  if (!currentRtmpUrl) {
    return { success: false, error: 'Nenhuma URL RTMP configurada.' };
  }

  await killFfmpeg();

  // Pequena pausa para o servidor RTMP liberar a conexão
  await new Promise(r => setTimeout(r, 500));

  let args;
  if (!videoPath) {
    args = buildScreensaverArgs(currentRtmpUrl);
  } else {
    const filePath = resolveFilePath(videoPath);
    args = buildVideoArgs(filePath, offsetSeconds, currentRtmpUrl);
  }

  try {
    spawnFfmpeg(args);
    return { success: true };
  } catch (err) {
    streamStatus = 'error';
    return { success: false, error: err.message };
  }
});

// Parar stream completamente
ipcMain.handle('stop-stream', async () => {
  if (ffmpegProcess) {
    await killFfmpeg();
    streamStatus = 'idle';
    currentRtmpUrl = '';
    return { success: true };
  }
  return { success: false, error: 'Nenhuma transmissão ativa.' };
});

ipcMain.handle('get-stream-status', async () => {
  return { status: streamStatus };
});

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
    // Mata o ffmpeg se estiver rodando
    if (ffmpegProcess) {
      ffmpegProcess.kill('SIGTERM');
      ffmpegProcess = null;
    }
    app.quit();
  }
});
