import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import { fetchTwitchVods, fetchYouTubeVideos, type VideoItem } from './services/api';

interface ScheduledProgram {
  id: string;
  video: VideoItem;
  startTime: string; // "14:00"
  durationMinutes: number;
  channelId: string;
}


interface OverlayLayer {
  id: string;
  type: 'text' | 'ticker' | 'clock';
  enabled: boolean;
  label: string;
  text: string;
  x: number;           // 0-100 % of canvas
  y: number;           // 0-100 % of canvas
  color: string;
  fontSize: number;
  bgEnabled: boolean;
  bgFullWidth: boolean; // barra que ocupa 100% da largura
  scrollSpeed: number;  // px/s no espaço 1920px
  scrollDir: 'left' | 'right';
}
interface OverlayConfig {
  enabled: boolean;
  layers: OverlayLayer[];
}
const defaultOverlay: OverlayConfig = { enabled: false, layers: [] };


function App() {
  const [activeTab, setActiveTab] = useState('schedule');
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [connections, setConnections] = useState<{ twitch: string | null, youtube: string | null, local: boolean }>({ twitch: null, youtube: null, local: false });
  const [loading, setLoading] = useState(false);
  
  // Phase 3: Schedule State
  const [scheduledPrograms, setScheduledPrograms] = useState<ScheduledProgram[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [selectedTime, setSelectedTime] = useState('14:00');
  
  const [channels, setChannels] = useState([{ id: 'c1', name: 'Principal' }]);
  const [selectedChannelId, setSelectedChannelId] = useState('c1');
  const [newChannelName, setNewChannelName] = useState('');

  // API Keys State
  const [twitchClientId, setTwitchClientId] = useState('');
  const [youtubeClientId, setYoutubeClientId] = useState('');
  const [youtubeClientSecret, setYoutubeClientSecret] = useState('');
  const [keysSaved, setKeysSaved] = useState(false);
  const [ytError, setYtError] = useState('');

  // Overlay State
  const [overlayConfig, setOverlayConfig] = useState<OverlayConfig>(defaultOverlay);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const previewRef = React.useRef<HTMLDivElement>(null);

  const updateLayer = (id: string, updates: Partial<OverlayLayer>) =>
    setOverlayConfig(prev => ({ ...prev, layers: prev.layers.map(l => l.id === id ? { ...l, ...updates } : l) }));

  const addLayer = (type: OverlayLayer['type']) => {
    const presets: Record<string, Partial<OverlayLayer>> = {
      text:   { text: 'Meu Texto',            x: 5,  y: 5,  fontSize: 40, bgEnabled: true,  bgFullWidth: false, scrollSpeed: 150, scrollDir: 'left' },
      ticker: { text: 'Mensagem em movimento...📡', x: 0,  y: 92, fontSize: 30, bgEnabled: true,  bgFullWidth: true,  scrollSpeed: 180, scrollDir: 'left' },
      clock:  { text: '',                     x: 78, y: 4,  fontSize: 32, bgEnabled: true,  bgFullWidth: false, scrollSpeed: 150, scrollDir: 'left' },
    };
    const layer: OverlayLayer = {
      id: Date.now().toString(), type, enabled: true,
      label: type === 'ticker' ? 'Ticker →' : type === 'clock' ? 'Relógio' : 'Texto',
      color: '#ffffff', ...presets[type]
    } as OverlayLayer;
    setOverlayConfig(prev => ({ ...prev, layers: [...prev.layers, layer] }));
    setSelectedLayerId(layer.id);
  };

  const removeLayer = (id: string) => {
    setOverlayConfig(prev => ({ ...prev, layers: prev.layers.filter(l => l.id !== id) }));
    setSelectedLayerId(null);
  };

  const handlePreviewMouseMove = (e: React.MouseEvent) => {
    if (!draggingId || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(99, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(99, ((e.clientY - rect.top) / rect.height) * 100));
    updateLayer(draggingId, { x, y });
  };

  // RTMP Streaming State
  const [rtmpUrl, setRtmpUrl] = useState('rtmp://a.rtmp.youtube.com/live2');
  const [streamKey, setStreamKey] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  // Phase 4: Live Player State
  const [currentTimeTick, setCurrentTimeTick] = useState(new Date());

  const times = ['14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00'];

  // Helper to parse "HH:MM:SS" or "MM:SS" into minutes
  const parseDuration = (durationStr: string) => {
    const parts = durationStr.split(':').map(Number);
    if (parts.length === 3) return parts[0] * 60 + parts[1] + parts[2] / 60;
    if (parts.length === 2) return parts[0] + parts[1] / 60;
    return 60; // fallback
  };

  useEffect(() => {
    const loadVideos = async () => {
      setLoading(true);
      setYtError('');
      try {
        // Twitch e YouTube carregados independentemente para não bloquear um ao outro
        const twitchData = connections.twitch
          ? await fetchTwitchVods(connections.twitch).catch(e => { console.error(e); return []; })
          : [];

        let ytData: VideoItem[] = [];
        if (connections.youtube) {
          try {
            ytData = await fetchYouTubeVideos(connections.youtube);
          } catch (e: any) {
            const msg = e?.message || String(e);
            setYtError(msg);
            console.error('[YouTube]', msg);
          }
        }

        // Mantém os vídeos locais na biblioteca ao invés de sobrescrever
        setVideos(prev => {
          const locals = prev.filter(v => v.platform === 'local');
          return [...twitchData, ...ytData, ...locals];
        });
      } finally {
        setLoading(false);
      }
    };
    
    loadVideos();
  }, [connections.twitch, connections.youtube]); // Roda apenas se Twitch ou YT mudarem

  // Persistência: Carregar dados salvos na inicialização
  useEffect(() => {
    const loadSavedData = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        if (!ipcRenderer) return;

        const result = await ipcRenderer.invoke('load-data');
        if (result.success && result.data) {
          const d = result.data;
          if (d.scheduledPrograms) setScheduledPrograms(d.scheduledPrograms);
          if (d.channels) setChannels(d.channels);
          if (d.twitchClientId) setTwitchClientId(d.twitchClientId);
          if (d.youtubeClientId) setYoutubeClientId(d.youtubeClientId);
          if (d.youtubeClientSecret) setYoutubeClientSecret(d.youtubeClientSecret);
          if (d.rtmpUrl) setRtmpUrl(d.rtmpUrl);
          if (d.streamKey) setStreamKey(d.streamKey);
          if (d.selectedChannelId) setSelectedChannelId(d.selectedChannelId);
          if (d.overlayConfig) {
            // Migração/segurança: previne crash se carregar formato antigo (sem .layers)
            if (Array.isArray(d.overlayConfig.layers)) {
              setOverlayConfig(d.overlayConfig);
            } else {
              setOverlayConfig({ enabled: false, layers: [] });
            }
          }
          if (d.localVideos && d.localVideos.length > 0) {
            setVideos(d.localVideos);
            setConnections(prev => ({ ...prev, local: true }));
          }
          console.log('[StreamTV] Dados restaurados com sucesso.');
        }
      } catch (e) {
        console.error('[StreamTV] Erro ao carregar dados:', e);
      }
    };
    loadSavedData();
  }, []); // Roda uma única vez na montagem

  // Persistência: Salvar automaticamente quando dados mudam
  const isFirstRender = useRef(true);
  useEffect(() => {
    // Pula o primeiro render (evita salvar dados vazios por cima dos salvos)
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const saveData = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        if (!ipcRenderer) return;

        const localVideos = videos.filter(v => v.platform === 'local');

        await ipcRenderer.invoke('save-data', {
          scheduledPrograms, channels, twitchClientId, youtubeClientId,
          youtubeClientSecret, rtmpUrl, streamKey, selectedChannelId, localVideos, overlayConfig,
        });
      } catch (e) {
        console.error('[StreamTV] Erro ao salvar:', e);
      }
    };
    saveData();
  }, [scheduledPrograms, channels, twitchClientId, youtubeClientId, youtubeClientSecret, rtmpUrl, streamKey, videos, overlayConfig]);

  // Phase 4: Clock Tick for Live Player
  useEffect(() => {
    let interval: any;
    if (activeTab === 'live') {
      interval = setInterval(() => {
        setCurrentTimeTick(new Date());
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [activeTab]);

  const getLocalVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      video.src = url;
      video.onloadedmetadata = () => {
        resolve(video.duration);
      };
      video.onerror = () => {
        resolve(0); // Em caso de erro, duração 0
      };
    });
  };

  const handleConnectLocal = async () => {
    if (connections.local) {
      setConnections(prev => ({ ...prev, local: false }));
      setVideos(prev => prev.filter(v => v.platform !== 'local'));
      return;
    }
    try {
      // @ts-ignore
      const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
      if (ipcRenderer) {
        const files = await ipcRenderer.invoke('select-folder');
        if (files && files.length > 0) {
          setLoading(true);
          const localVideos = await Promise.all(files.map(async (f: any) => {
            const durationSeconds = await getLocalVideoDuration(f.path);
            return {
              id: f.path, // ID armazena o file:/// path para podermos tocar no player
              title: f.name,
              duration: formatTime(Math.round(durationSeconds)),
              thumbnail: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&w=400&q=80',
              platform: 'local',
              date: new Date().toLocaleDateString()
            };
          }));
          
          setVideos(prev => {
            const others = prev.filter(v => v.platform !== 'local');
            return [...others, ...localVideos];
          });
          setConnections(prev => ({ ...prev, local: true }));
          setLoading(false);
          alert(`Importados ${localVideos.length} vídeos locais com sucesso!`);
        }
      } else {
        alert("Erro: ipcRenderer não encontrado.");
      }
    } catch(err) {
      alert(`Falha ao ler pasta: ${err}`);
      setLoading(false);
    }
  };

  const handleConnect = async (platform: 'twitch' | 'youtube') => {
    if (!connections[platform]) {
      try {
        // @ts-ignore: window.require is available due to contextIsolation: false
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        
        if (ipcRenderer) {
          // Salvar IDs antes de tentar login
          await ipcRenderer.invoke('save-client-ids', { twitchId: twitchClientId, youtubeId: youtubeClientId, youtubeSecret: youtubeClientSecret });
          const channel = platform === 'twitch' ? 'login-twitch' : 'login-youtube';
          const token = await ipcRenderer.invoke(channel);
          if (token) {
            console.log(`${platform} Token recebido:`, token);
            alert(`${platform === 'twitch' ? 'Twitch' : 'YouTube'} Autenticada com sucesso! (Token recebido)`);
            setConnections(prev => ({ ...prev, [platform]: token }));
          }
        } else {
          alert("Erro: ipcRenderer não encontrado. Certifique-se de rodar via Electron.");
        }
      } catch (err) {
        alert(`Falha no login: ${err}`);
      }
    } else {
      // Disconnect logic
      setConnections(prev => ({ ...prev, [platform]: null }));
    }
  };

  const handleAddProgram = () => {
    const video = videos.find(v => v.id === selectedVideoId);
    if (!video) return alert("Selecione um vídeo!");
    
    const exists = scheduledPrograms.find(p => p.startTime === selectedTime && p.channelId === selectedChannelId);
    if (exists) {
      return alert("Já existe um vídeo agendado para este horário exato neste programa!");
    }

    const duration = Math.round(parseDuration(video.duration));

    const newProgram: ScheduledProgram = {
      id: Date.now().toString(),
      video,
      startTime: selectedTime,
      durationMinutes: duration,
      channelId: selectedChannelId
    };

    setScheduledPrograms(prev => [...prev, newProgram].sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const handleAddChannel = () => {
    if (!newChannelName.trim()) return alert("Digite o nome do Programa!");
    const newChan = { id: Date.now().toString(), name: newChannelName };
    setChannels(prev => [...prev, newChan]);
    setSelectedChannelId(newChan.id);
    setNewChannelName('');
  };

  const getBlockStyle = (program: ScheduledProgram) => {
    const startParts = program.startTime.split(':').map(Number);
    const baseHour = 14; 
    const offsetMinutes = (startParts[0] - baseHour) * 60 + startParts[1];
    
    return {
      left: `${(offsetMinutes / 60) * 150}px`,
      width: `${(program.durationMinutes / 60) * 150}px`,
      position: 'absolute' as const,
      height: '60px',
      top: '10px'
    };
  };

  // Phase 4: Calculate what's playing right now based on actual System Time
  const getCurrentLiveProgram = () => {
    const currentHour = currentTimeTick.getHours();
    const currentMinute = currentTimeTick.getMinutes();
    const currentSecond = currentTimeTick.getSeconds();
    
    const currentTotalSeconds = currentHour * 3600 + currentMinute * 60 + currentSecond;

    for (const p of scheduledPrograms) {
      const pParts = p.startTime.split(':').map(Number);
      const pStartSeconds = pParts[0] * 3600 + pParts[1] * 60;
      const pEndSeconds = pStartSeconds + p.durationMinutes * 60;

      if (currentTotalSeconds >= pStartSeconds && currentTotalSeconds < pEndSeconds) {
        return {
          program: p,
          offsetSeconds: currentTotalSeconds - pStartSeconds,
          isLive: true
        };
      }
    }
    return { program: null, offsetSeconds: 0, isLive: false };
  };

  const { program: liveProgram, offsetSeconds, isLive } = getCurrentLiveProgram();

  // Helper to format seconds to HH:MM:SS
  const formatTime = (totalSeconds: number) => {
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && isLive && activeTab === 'live') {
      if (Math.abs(videoRef.current.currentTime - offsetSeconds) > 2) {
        videoRef.current.currentTime = offsetSeconds;
      }
    }
  }, [offsetSeconds, isLive, activeTab]);

  // Auto-switch RTMP: troca entre vídeo e screensaver quando streaming
  const lastLiveProgramId = useRef<string | null>(null);
  useEffect(() => {
    if (!isStreaming) return;

    const currentId = liveProgram?.id || null;
    if (currentId === lastLiveProgramId.current) return;
    lastLiveProgramId.current = currentId;

    const doSwitch = async () => {
      try {
        // @ts-ignore
        const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
        if (!ipcRenderer) return;

        if (currentId && liveProgram) {
          await ipcRenderer.invoke('switch-stream', {
            videoPath: liveProgram.video.id,
            offsetSeconds,
            overlayConfig,
            programTitle: liveProgram.video.title,
          });
        } else {
          await ipcRenderer.invoke('switch-stream', {
            videoPath: null,
            offsetSeconds: 0,
            overlayConfig,
            programTitle: '',
          });
        }
      } catch (e) {
        console.error('[StreamTV] Erro ao trocar stream:', e);
      }
    };
    doSwitch();
  }, [isStreaming, liveProgram?.id]);

  return (
    <div className="app-container">
      <aside className="sidebar">
        <div className="logo-area">
          <span className="tv-icon">📺</span>
          <span>StreamTV</span>
        </div>
        <nav>
          <div className={`nav-item ${activeTab === 'library' ? 'active' : ''}`} onClick={() => setActiveTab('library')}>
            📚 Biblioteca
          </div>
          <div className={`nav-item ${activeTab === 'schedule' ? 'active' : ''}`} onClick={() => setActiveTab('schedule')}>
            📅 Grade de Horários
          </div>
          <div className={`nav-item ${activeTab === 'live' ? 'active' : ''}`} onClick={() => setActiveTab('live')}>
            🔴 Modo Transmissão
          </div>
          <div className={`nav-item ${activeTab === 'overlay' ? 'active' : ''}`} onClick={() => setActiveTab('overlay')}>
            🎨 Overlay
          </div>
          <div className={`nav-item ${activeTab === 'settings' ? 'active' : ''}`} onClick={() => setActiveTab('settings')}>
            ⚙️ Conexões / Login
          </div>
        </nav>
      </aside>

      <main className="main-content">
        {activeTab !== 'live' && activeTab !== 'overlay' && (
          <header className="header">
            <h1>
              {activeTab === 'schedule' && 'Grade de Programação (TV Guide)'}
              {activeTab === 'library' && 'Sua Biblioteca de VODs e Vídeos'}
              {activeTab === 'settings' && 'Conexões e Contas'}
            </h1>
          </header>
        )}

        {/* ... Library & Settings Tabs unchanged ... */}
        {activeTab === 'library' && (
          <div className="schedule-container">
            <p>Seus VODs e vídeos importados.</p>
            {ytError && (
              <div style={{
                backgroundColor: 'rgba(220,38,38,0.15)',
                border: '1px solid rgba(220,38,38,0.5)',
                borderRadius: '4px',
                padding: '12px 16px',
                marginBottom: '20px',
                color: '#fca5a5',
                fontSize: '13px',
                fontFamily: 'monospace'
              }}>
                <strong>⚠️ Erro ao carregar vídeos do YouTube:</strong><br />
                {ytError}
                {ytError.includes('accessNotConfigured') || ytError.includes('API') ? (
                  <div style={{ marginTop: '8px', fontFamily: 'sans-serif', color: '#fecaca' }}>
                    👉 Ative a <strong>YouTube Data API v3</strong> no{' '}
                    <a href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" style={{ color: '#93c5fd' }}>
                      Google Cloud Console
                    </a>.
                  </div>
                ) : null}
              </div>
            )}
            {loading ? <p>Carregando...</p> : (
              <div className="library-grid">
                {videos.map(video => (
                  <div className="video-card" key={video.id}>
                    <div className="video-thumb" style={{ backgroundImage: `url(${video.thumbnail})` }}>
                      <span className="video-duration">{video.duration}</span>
                    </div>
                    <div className="video-info">
                      <div className="video-title">{video.title}</div>
                      <div className="video-meta">{video.platform} • {video.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Overlay Editor Tab */}
        {activeTab === 'overlay' && (
          <div style={{ display:'flex', flex:1, flexDirection:'column', overflow:'hidden' }}>

            {/* Toolbar */}
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 20px', backgroundColor:'var(--bg-secondary)', borderBottom:'1px solid var(--border-color)', flexShrink:0 }}>
              <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', marginRight:'10px' }}>
                <input type="checkbox" checked={overlayConfig.enabled}
                  onChange={e => setOverlayConfig(p => ({ ...p, enabled: e.target.checked }))} />
                <span style={{ fontWeight:'bold', color: overlayConfig.enabled ? '#4ade80' : 'var(--text-secondary)' }}>
                  {overlayConfig.enabled ? '● Overlay Ativo' : '○ Overlay Inativo'}
                </span>
              </label>
              <span style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Adicionar camada:</span>
              <button onClick={() => addLayer('text')}   style={{ background:'var(--accent-color)', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>✏️ Texto</button>
              <button onClick={() => addLayer('ticker')} style={{ background:'#7c3aed', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>📡 Ticker</button>
              <button onClick={() => addLayer('clock')}  style={{ background:'#0369a1', color:'white', border:'none', padding:'6px 14px', borderRadius:'3px', cursor:'pointer', fontSize:'13px' }}>🕐 Relógio</button>
            </div>

            <div style={{ display:'flex', flex:1, overflow:'hidden' }}>

              {/* Preview Canvas */}
              <div style={{ flex:1, padding:'20px', overflow:'auto', display:'flex', flexDirection:'column' }}>
                <p style={{ color:'var(--text-secondary)', fontSize:'12px', marginBottom:'8px' }}>Arraste os elementos no preview para reposicionar. Os tickers rolam automaticamente na live.</p>
                <div
                  ref={previewRef}
                  style={{ position:'relative', width:'100%', aspectRatio:'16/9', backgroundColor:'#080810', border:'1px solid var(--border-color)', overflow:'hidden', cursor: draggingId ? 'grabbing' : 'default', userSelect:'none' }}
                  onMouseMove={handlePreviewMouseMove}
                  onMouseUp={() => setDraggingId(null)}
                  onMouseLeave={() => setDraggingId(null)}
                >
                  {/* Simulated background */}
                  <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', opacity:0.1 }}>
                    <span style={{ fontSize:'64px' }}>📺</span>
                  </div>

                  {overlayConfig.enabled && (overlayConfig.layers || []).filter(l => l.enabled).map(layer => {
                    const isSelected = selectedLayerId === layer.id;
                    const fs = `clamp(9px, ${layer.fontSize / 16 * 1.4}vw, ${layer.fontSize * 0.7}px)`;
                    const baseStyle: React.CSSProperties = {
                      position: 'absolute',
                      left: layer.bgFullWidth ? 0 : `${layer.x}%`,
                      top: `${layer.y}%`,
                      width: layer.bgFullWidth ? '100%' : undefined,
                      color: layer.color,
                      fontSize: fs,
                      padding: layer.bgFullWidth ? `3px 10px 3px calc(${layer.x}% + 10px)` : '2px 6px',
                      backgroundColor: layer.bgEnabled ? (layer.bgFullWidth ? 'rgba(0,0,0,0.7)' : 'rgba(0,0,0,0.5)') : 'transparent',
                      whiteSpace: layer.bgFullWidth ? 'nowrap' : 'nowrap',
                      outline: isSelected ? '2px solid #646cff' : 'none',
                      cursor: layer.type === 'ticker' ? 'default' : 'grab',
                      boxSizing: 'border-box',
                      fontFamily: layer.type === 'clock' ? 'monospace' : 'inherit',
                      overflow: layer.bgFullWidth ? 'hidden' : undefined,
                    };
                    const content = layer.type === 'clock'
                      ? currentTimeTick.toLocaleTimeString()
                      : layer.type === 'ticker'
                      ? <span style={{ display:'inline-block', animation:`ticker-scroll ${Math.max(5, 300/((layer.scrollSpeed||150)/100))}s linear infinite`, whiteSpace:'nowrap' }}>{layer.text}</span>
                      : (layer.text || '(vazio)');
                    return (
                      <div
                        key={layer.id}
                        style={baseStyle}
                        onMouseDown={e => { e.stopPropagation(); if (layer.type !== 'ticker') { setDraggingId(layer.id); } setSelectedLayerId(layer.id); }}
                        onClick={() => setSelectedLayerId(layer.id)}
                      >
                        {content}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right Panel: Layer List + Editor */}
              <div style={{ width:'340px', backgroundColor:'var(--bg-secondary)', borderLeft:'1px solid var(--border-color)', display:'flex', flexDirection:'column', flexShrink:0 }}>

                {/* Layer List */}
                <div style={{ borderBottom:'1px solid var(--border-color)', padding:'12px' }}>
                  <p style={{ color:'var(--text-secondary)', fontSize:'11px', margin:'0 0 8px 0', textTransform:'uppercase', letterSpacing:'1px' }}>Camadas ({(overlayConfig.layers || []).length})</p>
                  {(overlayConfig.layers || []).length === 0 && <p style={{ color:'var(--text-secondary)', fontSize:'12px', margin:0 }}>Nenhuma camada. Adicione uma acima.</p>}
                  {(overlayConfig.layers || []).map((layer) => (
                    <div
                      key={layer.id}
                      onClick={() => setSelectedLayerId(layer.id)}
                      style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', borderRadius:'3px', cursor:'pointer', marginBottom:'4px', backgroundColor: selectedLayerId === layer.id ? 'rgba(100,108,255,0.2)' : 'transparent', border: selectedLayerId === layer.id ? '1px solid rgba(100,108,255,0.5)' : '1px solid transparent' }}
                    >
                      <span style={{ fontSize:'16px' }}>{layer.type === 'ticker' ? '📡' : layer.type === 'clock' ? '🕐' : '✏️'}</span>
                      <span style={{ flex:1, fontSize:'13px', color:'white' }}>{layer.label}</span>
                      <input type="checkbox" checked={layer.enabled} onChange={e => { e.stopPropagation(); updateLayer(layer.id, { enabled: e.target.checked }); }} onClick={e => e.stopPropagation()} />
                    </div>
                  ))}
                </div>

                {/* Selected Layer Editor */}
                <div style={{ flex:1, overflowY:'auto', padding:'16px' }}>
                  {!selectedLayerId && <p style={{ color:'var(--text-secondary)', fontSize:'13px' }}>Selecione uma camada para editar.</p>}
                  {selectedLayerId && (() => {
                    const layer = (overlayConfig.layers || []).find(l => l.id === selectedLayerId);
                    if (!layer) return null;
                    const inp: React.CSSProperties = { backgroundColor:'var(--bg-tertiary)', color:'white', border:'1px solid var(--border-color)', padding:'7px 9px', borderRadius:'3px', outline:'none', width:'100%', boxSizing:'border-box' as any };
                    const lbl: React.CSSProperties = { fontSize:'11px', color:'var(--text-secondary)', display:'block', marginBottom:'4px', marginTop:'12px' };
                    return (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                            <span style={{ fontSize:'18px' }}>{layer.type === 'ticker' ? '📡' : layer.type === 'clock' ? '🕐' : '✏️'}</span>
                            <input value={layer.label} onChange={e => updateLayer(layer.id, { label: e.target.value })} style={{ ...inp, width:'140px', fontWeight:'bold', fontSize:'14px' }} />
                          </div>
                          <button onClick={() => removeLayer(layer.id)} style={{ background:'rgba(220,38,38,0.3)', color:'#fca5a5', border:'1px solid rgba(220,38,38,0.5)', padding:'5px 10px', borderRadius:'3px', cursor:'pointer', fontSize:'12px' }}>🗑 Excluir</button>
                        </div>

                        {layer.type !== 'clock' && <>
                          <span style={lbl}>Texto {layer.type === 'ticker' ? '(rola na live)' : ''}</span>
                          <textarea value={layer.text} onChange={e => updateLayer(layer.id, { text: e.target.value })} rows={3} style={{ ...inp, resize:'vertical', fontFamily:'inherit' }} placeholder="Digite o texto aqui..." />
                        </>}

                        <span style={lbl}>Cor do texto</span>
                        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
                          <input type="color" value={layer.color} onChange={e => updateLayer(layer.id, { color: e.target.value })} style={{ width:'50px', height:'34px', border:'1px solid var(--border-color)', borderRadius:'3px', cursor:'pointer', backgroundColor:'transparent' }} />
                          <input value={layer.color} onChange={e => updateLayer(layer.id, { color: e.target.value })} style={{ ...inp, fontFamily:'monospace', flex:1 }} />
                        </div>

                        <span style={lbl}>Tamanho da fonte: {layer.fontSize}px</span>
                        <input type="range" min={12} max={120} value={layer.fontSize} onChange={e => updateLayer(layer.id, { fontSize: Number(e.target.value) })} style={{ width:'100%' }} />

                        {layer.type !== 'ticker' && <>
                          <span style={lbl}>Posição X: {layer.x.toFixed(0)}%</span>
                          <input type="range" min={0} max={99} value={layer.x} onChange={e => updateLayer(layer.id, { x: Number(e.target.value) })} style={{ width:'100%' }} />
                        </>}

                        <span style={lbl}>Posição Y: {layer.y.toFixed(0)}%</span>
                        <input type="range" min={0} max={99} value={layer.y} onChange={e => updateLayer(layer.id, { y: Number(e.target.value) })} style={{ width:'100%' }} />

                        <span style={lbl}>Fundo</span>
                        <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer' }}>
                          <input type="checkbox" checked={layer.bgEnabled} onChange={e => updateLayer(layer.id, { bgEnabled: e.target.checked })} />
                          <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Ativar fundo semi-transparente</span>
                        </label>
                        {layer.bgEnabled && (
                          <label style={{ display:'flex', alignItems:'center', gap:'8px', cursor:'pointer', marginTop:'8px' }}>
                            <input type="checkbox" checked={layer.bgFullWidth} onChange={e => updateLayer(layer.id, { bgFullWidth: e.target.checked })} />
                            <span style={{ fontSize:'13px', color:'var(--text-secondary)' }}>Barra de fundo 100% da largura</span>
                          </label>
                        )}

                        {layer.type === 'ticker' && <>
                          <span style={lbl}>Velocidade: {layer.scrollSpeed}px/s</span>
                          <input type="range" min={50} max={800} value={layer.scrollSpeed} onChange={e => updateLayer(layer.id, { scrollSpeed: Number(e.target.value) })} style={{ width:'100%' }} />
                          <span style={lbl}>Direção</span>
                          <div style={{ display:'flex', gap:'8px' }}>
                            {(['left','right'] as const).map(d => (
                              <button key={d} onClick={() => updateLayer(layer.id, { scrollDir: d })}
                                style={{ flex:1, padding:'7px', borderRadius:'3px', cursor:'pointer', border:'1px solid var(--border-color)', backgroundColor: layer.scrollDir === d ? 'var(--accent-color)' : 'var(--bg-tertiary)', color:'white', fontSize:'13px' }}>
                                {d === 'left' ? '⬅ Da direita pra esquerda' : '➡ Da esquerda pra direita'}
                              </button>
                            ))}
                          </div>
                        </>}
                      </div>
                    );
                  })()}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (


          <div className="schedule-container">
            <h2>Configuração de APIs</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Insira seus Client IDs para habilitar a integração com Twitch e YouTube. Eles são usados apenas localmente.</p>
            <div className="connections-area" style={{ marginBottom: '30px' }}>
              <div className="connection-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="platform-icon twitch">Tw</div>
                  <h3 style={{ margin: 0 }}>Twitch Client ID</h3>
                </div>
                <input 
                  type="text" 
                  value={twitchClientId}
                  onChange={(e) => { setTwitchClientId(e.target.value); setKeysSaved(false); }}
                  placeholder="Cole seu Client ID da Twitch aqui"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none', width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
                />
              </div>
              <div className="connection-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div className="platform-icon youtube">Yt</div>
                  <h3 style={{ margin: 0 }}>YouTube Client ID</h3>
                </div>
                <input 
                  type="text" 
                  value={youtubeClientId}
                  onChange={(e) => { setYoutubeClientId(e.target.value); setKeysSaved(false); }}
                  placeholder="Cole seu Client ID do Google aqui"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none', width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
                />
                <input 
                  type="password" 
                  value={youtubeClientSecret}
                  onChange={(e) => { setYoutubeClientSecret(e.target.value); setKeysSaved(false); }}
                  placeholder="Cole seu Client Secret do Google aqui"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none', width: '100%', fontFamily: 'monospace', fontSize: '13px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Encontrado no Google Cloud Console → Credenciais → sua credencial OAuth → "Client Secret"</div>
              </div>
              <button 
                className="btn-connect" 
                onClick={async () => {
                  try {
                    // @ts-ignore
                    const ipcRenderer = window.require ? window.require('electron').ipcRenderer : null;
                    if (ipcRenderer) {
                      await ipcRenderer.invoke('save-client-ids', { twitchId: twitchClientId, youtubeId: youtubeClientId, youtubeSecret: youtubeClientSecret });
                      setKeysSaved(true);
                      setTimeout(() => setKeysSaved(false), 3000);
                    }
                  } catch(e) { alert('Erro ao salvar: ' + e); }
                }}
                style={{ backgroundColor: keysSaved ? '#4ade80' : 'var(--accent-color)', alignSelf: 'flex-start', transition: '0.3s' }}
              >
                {keysSaved ? '✓ Salvo!' : 'Salvar Chaves'}
              </button>
            </div>

            <h2>Configuração RTMP (Streaming)</h2>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>Configure a URL de saída para transmitir o conteúdo da sua grade ao vivo via RTMP.</p>
            <div className="connections-area" style={{ marginBottom: '30px' }}>
              <div className="connection-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Servidor RTMP:</label>
                <select 
                  value={rtmpUrl}
                  onChange={(e) => setRtmpUrl(e.target.value)}
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none' }}
                >
                  <option value="rtmp://a.rtmp.youtube.com/live2">YouTube Live</option>
                  <option value="rtmp://live.twitch.tv/app">Twitch</option>
                  <option value="rtmp://live-api-s.facebook.com:443/rtmp/">Facebook Live</option>
                  <option value="custom">Customizado</option>
                </select>
                {rtmpUrl === 'custom' && (
                  <input 
                    type="text"
                    placeholder="rtmp://seu-servidor.com/live"
                    onChange={(e) => setRtmpUrl(e.target.value)}
                    style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none', fontFamily: 'monospace', fontSize: '13px' }}
                  />
                )}
              </div>
              <div className="connection-card" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '10px' }}>
                <label style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Stream Key (Chave de Transmissão):</label>
                <input 
                  type="password" 
                  value={streamKey}
                  onChange={(e) => setStreamKey(e.target.value)}
                  placeholder="Cole sua chave de transmissão aqui"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '10px', borderRadius: '2px', outline: 'none', fontFamily: 'monospace', fontSize: '13px' }}
                />
                <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>A chave é mantida localmente e nunca é enviada para nenhum servidor.</div>
              </div>
            </div>

            <h2>Vincule suas contas</h2>
            <div className="connections-area">
              <div className="connection-card">
                <div className="connection-info">
                  <div className="platform-icon twitch">Tw</div>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0' }}>Twitch</h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{connections.twitch ? 'Conectado' : !twitchClientId ? 'Client ID não configurado' : 'Não conectado'}</div>
                  </div>
                </div>
                <button className="btn-connect" onClick={() => handleConnect('twitch')} style={{ backgroundColor: connections.twitch ? '#4ade80' : !twitchClientId ? '#333' : '', opacity: !twitchClientId && !connections.twitch ? 0.5 : 1 }} disabled={!twitchClientId && !connections.twitch}>
                  {connections.twitch ? 'Desconectar' : 'Conectar'}
                </button>
              </div>
              <div className="connection-card">
                <div className="connection-info">
                  <div className="platform-icon youtube">Yt</div>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0' }}>YouTube</h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{connections.youtube ? 'Conectado' : !youtubeClientId ? 'Client ID não configurado' : 'Não conectado'}</div>
                  </div>
                </div>
                <button className="btn-connect" onClick={() => handleConnect('youtube')} style={{ backgroundColor: connections.youtube ? '#4ade80' : !youtubeClientId ? '#333' : '', opacity: !youtubeClientId && !connections.youtube ? 0.5 : 1 }} disabled={!youtubeClientId && !connections.youtube}>
                  {connections.youtube ? 'Desconectar' : 'Conectar'}
                </button>
              </div>

              <div className="connection-card">
                <div className="connection-info">
                  <div className="platform-icon" style={{ backgroundColor: '#2a2a35' }}>📁</div>
                  <div>
                    <h3 style={{ margin: '0 0 5px 0' }}>Pasta Local</h3>
                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{connections.local ? 'Importado' : 'Sem vídeos'}</div>
                  </div>
                </div>
                <button className="btn-connect" onClick={handleConnectLocal} style={{ backgroundColor: connections.local ? '#4ade80' : '' }}>
                  {connections.local ? 'Remover Vídeos' : 'Selecionar Pasta'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'schedule' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div className="schedule-container" style={{ flex: 1, padding: '30px', overflowY: 'auto' }}>
              <p>Monte a grade selecionando os vídeos no painel lateral.</p>
              
              <div className="timeline">
                <div style={{ display: 'flex' }}>
                  <div style={{ width: '150px', flexShrink: 0, backgroundColor: 'var(--bg-secondary)', borderRight: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' }}></div>
                  <div className="time-header" style={{ flex: 1, borderBottom: '1px solid var(--border-color)' }}>
                    {times.map(time => (
                      <div key={time} className="time-slot" style={{ minWidth: '150px', flexShrink: 0, padding: '10px 0', textAlign: 'center', color: 'var(--text-secondary)' }}>{time}</div>
                    ))}
                  </div>
                </div>
                
                {channels.map(channel => (
                  <div key={channel.id} style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ 
                      width: '150px', 
                      flexShrink: 0, 
                      backgroundColor: 'var(--bg-secondary)', 
                      borderRight: '1px solid var(--border-color)', 
                      padding: '20px 10px', 
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: 'bold',
                      color: 'white',
                      position: 'sticky',
                      left: 0,
                      zIndex: 5
                    }}>
                      {channel.name}
                    </div>
                    <div className="channels-area" style={{ position: 'relative', height: '100px', flex: 1 }}>
                      <div className="channel-row" style={{ position: 'relative', width: '100%', height: '100%' }}>
                        {scheduledPrograms.filter(p => p.channelId === channel.id).length === 0 && <p style={{ padding: '20px', color: 'var(--text-secondary)' }}>Nenhum vídeo.</p>}
                        {scheduledPrograms.filter(p => p.channelId === channel.id).map(program => (
                          <div 
                            key={program.id} 
                            className="program-block"
                            style={{ ...getBlockStyle(program), top: '20px', height: '60px' }}
                          >
                            <div className="program-title">{program.video.title}</div>
                            <div className="program-time">{program.startTime} ({program.durationMinutes} min)</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ width: '320px', backgroundColor: 'var(--bg-secondary)', borderLeft: '1px solid var(--border-color)', padding: '30px', overflowY: 'auto', flexShrink: 0 }}>
              <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Criar Novo Programa</h3>
              <div className="editor-form" style={{ marginBottom: '30px' }}>
                <input 
                  type="text" 
                  value={newChannelName}
                  onChange={(e) => setNewChannelName(e.target.value)}
                  placeholder="Nome do Programa (ex: Reacts)"
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '2px', outline: 'none', width: '100%' }}
                />
                <button className="btn-connect" style={{ marginTop: '10px', backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-color)' }} onClick={handleAddChannel}>
                  + Criar Fileira
                </button>
              </div>

              <h3 style={{ marginTop: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '10px' }}>Adicionar à Grade</h3>
              <div className="editor-form">
                <label>Fileira / Programa:</label>
                <select value={selectedChannelId} onChange={(e) => setSelectedChannelId(e.target.value)}>
                  {channels.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>

                <label style={{ marginTop: '15px' }}>Escolha o Vídeo:</label>
                <select value={selectedVideoId} onChange={(e) => setSelectedVideoId(e.target.value)}>
                  <option value="">-- Selecione --</option>
                  {videos.map(v => (
                    <option key={v.id} value={v.id}>{v.title} ({v.duration})</option>
                  ))}
                </select>

                <label style={{ marginTop: '15px' }}>Horário de Início:</label>
                <input 
                  type="time" 
                  value={selectedTime} 
                  onChange={(e) => setSelectedTime(e.target.value)}
                  style={{ backgroundColor: 'var(--bg-tertiary)', color: 'white', border: '1px solid var(--border-color)', padding: '8px', borderRadius: '2px', outline: 'none' }}
                />
                
                <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '5px' }}>
                  {times.map(t => (
                    <button 
                      key={t} 
                      onClick={() => setSelectedTime(t)}
                      style={{ 
                        backgroundColor: selectedTime === t ? 'var(--accent-color)' : 'var(--bg-tertiary)', 
                        color: 'white', 
                        border: '1px solid var(--border-color)', 
                        padding: '4px 8px', 
                        borderRadius: '2px', 
                        fontSize: '12px',
                        cursor: 'pointer',
                        transition: '0.2s'
                      }}
                    >
                      {t}
                    </button>
                  ))}
                </div>

                <button className="btn-connect" style={{ marginTop: '20px', backgroundColor: 'var(--accent-color)' }} onClick={handleAddProgram}>
                  + Agendar Vídeo
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Phase 4: Live Transmissão Tab */}
        {activeTab === 'live' && (
          <div style={{ flex: 1, backgroundColor: '#000', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            
            {/* RTMP Controls - sempre visíveis */}
            <div style={{ position: 'absolute', top: '30px', right: '30px', zIndex: 10 }}>
              {!isStreaming ? (
                <button
                  onClick={async () => {
                    if (!streamKey) return alert('Configure a Stream Key na aba Conexões antes de iniciar.');
                    try {
                      // @ts-ignore
                      const ipcRenderer = window.require('electron').ipcRenderer;
                      const result = await ipcRenderer.invoke('start-stream', {
                        videoPath: liveProgram?.video?.id || null,
                        offsetSeconds: isLive ? offsetSeconds : 0,
                        rtmpUrl, streamKey,
                        mode: isLive ? 'video' : 'screensaver',
                        overlayConfig,
                        programTitle: liveProgram?.video?.title || '',
                      });
                      if (result.success) {
                        setIsStreaming(true);
                        lastLiveProgramId.current = liveProgram?.id || null;
                      } else {
                        alert('Erro: ' + result.error);
                      }
                    } catch (e) { alert('Erro ao iniciar stream: ' + e); }
                  }}
                  style={{ backgroundColor: '#dc2626', color: 'white', border: 'none', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  📡 Iniciar Stream
                </button>
              ) : (
                <button
                  onClick={async () => {
                    try {
                      // @ts-ignore
                      const ipcRenderer = window.require('electron').ipcRenderer;
                      await ipcRenderer.invoke('stop-stream');
                      setIsStreaming(false);
                    } catch (e) { alert('Erro ao parar: ' + e); }
                  }}
                  style={{ backgroundColor: '#333', color: '#ef4444', border: '2px solid #ef4444', padding: '10px 20px', fontWeight: 'bold', cursor: 'pointer', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
                >
                  ■ Parar Stream
                </button>
              )}
            </div>

            {/* Badges */}
            <div style={{ position: 'absolute', top: '30px', left: '30px', display: 'flex', gap: '10px', zIndex: 10 }}>
              {isLive && (
                <div style={{ backgroundColor: 'rgba(220, 38, 38, 0.9)', color: 'white', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', fontSize: '18px', letterSpacing: '1px' }}>
                  🔴 AO VIVO
                </div>
              )}
              {isStreaming && (
                <div style={{ backgroundColor: 'rgba(100, 108, 255, 0.9)', color: 'white', padding: '8px 16px', borderRadius: '4px', fontWeight: 'bold', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', animation: 'pulse 2s infinite' }}>
                  📡 STREAMING RTMP
                </div>
              )}
            </div>

            {isLive && liveProgram ? (
              <>
                <video 
                  ref={videoRef}
                  autoPlay 
                  muted 
                  style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                  src={liveProgram.video.platform === 'local' ? liveProgram.video.id : "https://www.w3schools.com/html/mov_bbb.mp4"}
                />
                
                <div style={{ position: 'absolute', bottom: '0', width: '100%', padding: '40px 40px 30px', background: 'linear-gradient(transparent, rgba(0,0,0,0.95))', zIndex: 10 }}>
                  <h2 style={{ margin: '0 0 15px 0', color: 'white', fontSize: '28px' }}>{liveProgram.video.title}</h2>
                  
                  <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                    <div style={{ flex: 1, height: '6px', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div style={{ 
                        height: '100%', 
                        backgroundColor: isStreaming ? '#dc2626' : 'var(--accent-color)', 
                        width: `${(offsetSeconds / (liveProgram.durationMinutes * 60)) * 100}%`,
                        transition: 'width 1s linear'
                      }} />
                    </div>
                    <span style={{ fontSize: '16px', fontFamily: 'monospace', color: 'rgba(255,255,255,0.9)' }}>
                      {formatTime(offsetSeconds)} / {formatTime(liveProgram.durationMinutes * 60)}
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="screensaver">
                <div className="screensaver-orb"></div>
                <div className="screensaver-orb"></div>
                <div className="screensaver-orb"></div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 2 }}>
                  <div className="screensaver-title">StreamTV</div>
                  <div className="screensaver-clock">
                    {formatTime(currentTimeTick.getHours() * 3600 + currentTimeTick.getMinutes() * 60 + currentTimeTick.getSeconds())}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

export default App;
