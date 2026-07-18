export interface VideoItem {
  id: string;
  title: string;
  duration: string;
  thumbnail: string;
  platform: 'twitch' | 'youtube' | 'local';
  date: string;
}

// ATENÇÃO: Substitua pelo seu Client ID real
const TWITCH_CLIENT_ID = 'seu_client_id_da_twitch_aqui';

// Converte duração da Twitch (1h30m10s -> 01:30:10)
function formatTwitchDuration(durationStr: string) {
  const match = durationStr.match(/(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/);
  if (!match) return "00:00:00";
  const h = match[1] ? match[1].padStart(2, '0') : "00";
  const m = match[2] ? match[2].padStart(2, '0') : "00";
  const s = match[3] ? match[3].padStart(2, '0') : "00";
  return `${h}:${m}:${s}`;
}

export const fetchTwitchVods = async (token?: string | null): Promise<VideoItem[]> => {
  if (!token) return [];
  
  try {
    const userRes = await fetch('https://api.twitch.tv/helix/users', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': TWITCH_CLIENT_ID
      }
    });
    
    if (!userRes.ok) throw new Error("Falha ao buscar usuário da Twitch.");
    
    const userData = await userRes.json();
    if (!userData.data || userData.data.length === 0) return [];
    
    const userId = userData.data[0].id;

    const videoRes = await fetch(`https://api.twitch.tv/helix/videos?user_id=${userId}&type=archive`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Client-Id': TWITCH_CLIENT_ID
      }
    });
    const videoData = await videoRes.json();
    
    return videoData.data.map((v: any) => ({
      id: v.id,
      title: v.title,
      duration: formatTwitchDuration(v.duration),
      thumbnail: v.thumbnail_url.replace('%{width}', '640').replace('%{height}', '360'),
      platform: 'twitch',
      date: new Date(v.created_at).toLocaleDateString()
    }));
  } catch (err) {
    console.error("Erro ao buscar Twitch VODs:", err);
    return [];
  }
};

// Converte duração do YouTube (PT1H30M10S -> 01:30:10)
function formatYouTubeDuration(durationStr: string) {
  const match = durationStr.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return "00:00:00";
  const h = match[1] ? match[1].padStart(2, '0') : "00";
  const m = match[2] ? match[2].padStart(2, '0') : "00";
  const s = match[3] ? match[3].padStart(2, '0') : "00";
  return `${h}:${m}:${s}`;
}

// Helper: lança erro com o corpo real da resposta do Google
async function assertOk(res: Response, context: string) {
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = await res.json();
      const msg = body?.error?.message || body?.error || JSON.stringify(body);
      detail = `${res.status} — ${msg}`;
    } catch {}
    throw new Error(`[${context}] ${detail}`);
  }
}

// Lança erro em vez de retornar [] silenciosamente
export const fetchYouTubeVideos = async (token?: string | null): Promise<VideoItem[]> => {
  if (!token) return [];

  // 1. Busca o canal do usuário autenticado
  const chanRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(chanRes, 'channels');

  const chanData = await chanRes.json();
  if (!chanData.items || chanData.items.length === 0) {
    throw new Error('Nenhum canal do YouTube encontrado para esta conta.');
  }

  const uploadsPlaylistId = chanData.items[0].contentDetails.relatedPlaylists.uploads;

  // 2. Busca os últimos 20 vídeos do canal
  const plRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${uploadsPlaylistId}&maxResults=20`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(plRes, 'playlistItems');

  const plData = await plRes.json();
  if (!plData.items || plData.items.length === 0) {
    return []; // canal existe mas sem vídeos
  }

  const videoIds = plData.items.map((i: any) => i.snippet.resourceId.videoId).join(',');

  // 3. Busca duração e thumbnail de cada vídeo
  const vidRes = await fetch(
    `https://youtube.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${videoIds}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await assertOk(vidRes, 'videos');

  const vidData = await vidRes.json();

  const durationMap: Record<string, string> = {};
  const thumbnailMap: Record<string, string> = {};
  (vidData.items || []).forEach((v: any) => {
    durationMap[v.id] = formatYouTubeDuration(v.contentDetails?.duration || '');
    thumbnailMap[v.id] = v.snippet?.thumbnails?.high?.url
      || v.snippet?.thumbnails?.default?.url
      || '';
  });

  return plData.items.map((item: any) => {
    const vId = item.snippet.resourceId.videoId;
    return {
      id: vId,
      title: item.snippet.title,
      duration: durationMap[vId] || '01:00:00',
      thumbnail: thumbnailMap[vId] || item.snippet.thumbnails?.high?.url || '',
      platform: 'youtube',
      date: new Date(item.snippet.publishedAt).toLocaleDateString()
    };
  });
};

// 4. Atualiza o título da transmissão ao vivo ativa
export const updateYouTubeLiveTitle = async (token: string, newTitle: string): Promise<boolean> => {
  if (!token) return false;
  try {
    // Busca o broadcast persistente ("Stream Now" padrão) ou qualquer um ativo
    const activeRes = await fetch(
      `https://youtube.googleapis.com/youtube/v3/liveBroadcasts?part=snippet&broadcastType=persistent&mine=true`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!activeRes.ok) return false;
    const activeData = await activeRes.json();
    if (!activeData.items || activeData.items.length === 0) {
      console.warn('Nenhuma live persistente encontrada para atualizar o título.');
      return false; 
    }

    const broadcast = activeData.items[0];
    const snippet = broadcast.snippet;
    snippet.title = newTitle; // Atualiza apenas o título

    // Atualiza o broadcast na API (requer o objeto snippet inteiro + id)
    const updateRes = await fetch(
      `https://youtube.googleapis.com/youtube/v3/liveBroadcasts?part=snippet`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          id: broadcast.id,
          snippet: snippet
        })
      }
    );
    return updateRes.ok;
  } catch (e) {
    console.error('Erro ao atualizar título da live no YouTube:', e);
    return false;
  }
};
