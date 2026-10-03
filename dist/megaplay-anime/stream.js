// stream.js — resolves video stream URL via Protags Network backend pipeline

const LANG_MAP = {
  english: 'en',
  eng: 'en',
  spanish: 'es',
  spa: 'es',
  french: 'fr',
  fre: 'fr',
  fra: 'fr',
  german: 'de',
  ger: 'de',
  deu: 'de',
  italian: 'it',
  ita: 'it',
  portuguese: 'pt',
  por: 'pt',
  russian: 'ru',
  rus: 'ru',
  arabic: 'ar',
  ara: 'ar',
  japanese: 'ja',
  jap: 'ja',
  jpn: 'ja',
  chinese: 'zh',
  chi: 'zh',
  zho: 'zh',
  korean: 'ko',
  kor: 'ko',
};

function getIsoLanguage(label) {
  if (!label) return 'en';
  const l = label.toLowerCase();
  for (const [key, code] of Object.entries(LANG_MAP)) {
    if (l.includes(key)) return code;
  }
  return 'en';
}

function formatSubtitles(tracks, proxyUrlBase) {
  if (!Array.isArray(tracks) || tracks.length === 0) return undefined;

  const valid = [];
  for (const t of tracks) {
    if (!t || !t.file || typeof t.file !== 'string') continue;

    const kind = (t.kind || '').toLowerCase();
    const label = t.label || t.name || 'English';
    if (kind === 'thumbnails' || label.toLowerCase() === 'thumbnails') continue;

    let fileUrl = t.file.trim();
    if (!fileUrl) continue;

    if (fileUrl.startsWith('//')) {
      fileUrl = `https:${fileUrl}`;
    } else if (fileUrl.startsWith('/')) {
      fileUrl = `https://megaplay.buzz${fileUrl}`;
    }

    if (!fileUrl.startsWith('http://') && !fileUrl.startsWith('https://')) continue;

    const isVtt = fileUrl.includes('.vtt');
    const proxiedSubUrl = `${proxyUrlBase}?url=${encodeURIComponent(fileUrl)}`;

    valid.push({
      title: label,
      language: getIsoLanguage(label),
      type: isVtt ? 'text/vtt' : 'application/x-subrip',
      uri: proxiedSubUrl,
    });
  }

  return valid.length > 0 ? valid : undefined;
}

function formatSkipIntervals(intro, outro) {
  const skip = [];
  if (intro && typeof intro.start === 'number' && typeof intro.end === 'number' && intro.end > intro.start) {
    skip.push({ title: 'Skip Intro', from: intro.start, to: intro.end });
  }
  if (outro && typeof outro.start === 'number' && typeof outro.end === 'number' && outro.end > outro.start) {
    skip.push({ title: 'Skip Outro', from: outro.start, to: outro.end });
  }
  return skip.length > 0 ? skip : undefined;
}

/**
 * Safely read the backend server URL from kvStore.
 * Wrapped in try/catch because the kvStore implementation differs between
 * vega-app (MMKV-backed) and vega-desktop (localStorage-backed via Tauri),
 * and edge cases (empty store, wrong types, exceptions) must be handled.
 */
async function getServerBaseUrl(kvStore) {
  const DEFAULT_BASE = 'https://cdn.originory.com';
  try {
    if (kvStore && typeof kvStore.get === 'function') {
      const storedUrl = await kvStore.get('serverUrl');
      if (storedUrl && typeof storedUrl === 'string' && storedUrl.trim()) {
        return storedUrl.trim().replace(/\/+$/, '');
      }
    }
  } catch (e) {
    console.warn('[protags-network stream] kvStore.get error, using default base:', e.message);
  }
  return DEFAULT_BASE;
}

/**
 * Safely extract an HLS URL from the megaplay response data.
 * Handles all known response shapes: string, array, or object.
 */
function extractHlsUrl(data) {
  if (!data || !data.sources) return null;

  if (typeof data.sources === 'string') {
    return data.sources;
  }
  if (Array.isArray(data.sources)) {
    const hls = data.sources.find(s => s.type === 'hls' || (s.file && s.file.includes('.m3u8'))) || data.sources[0];
    return hls?.file || hls?.src || null;
  }
  if (typeof data.sources === 'object') {
    return data.sources.file || data.sources.src || null;
  }
  return null;
}

exports.getStream = async function getStream({ link, type, signal, providerContext, isDownload }) {
  const { axios } = providerContext;

  const rawPath = link.startsWith('mal/') ? link : `mal/${link}`;
  const subPath = rawPath.includes('/dub') ? rawPath.replace('/dub', '/sub') : (rawPath.includes('/sub') ? rawPath : `${rawPath}/sub`);
  const dubPath = subPath.replace('/sub', '/dub');

  try {
    const base = await getServerBaseUrl(providerContext.kvStore);
    const proxyUrlBase = `${base}/api/m3u8-proxy`;
    const streams = [];

    const fetchTimeout = isDownload ? 30000 : 20000;
    // For downloads, bypass the 5-minute stream cache to get a fresh signed CDN URL
    const refreshParam = isDownload ? '?refresh=true' : '';

    // Build common request config — both Tauri adapter and native OkHttp handle these
    const reqConfig = { timeout: fetchTimeout };
    if (signal) reqConfig.signal = signal;

    // 1. Fetch Sub version
    let subSkip = undefined;
    try {
      const subRes = await axios.get(`${base}/api/megaplay/${subPath}${refreshParam}`, reqConfig);
      // Small delay to let megaplay stabilize — helps with cold-cache scrapes
      if (isDownload && !subRes.data) {
        await new Promise(r => setTimeout(r, 1500));
      }
      const data = subRes.data;
      const hlsUrl = extractHlsUrl(data);

      if (hlsUrl) {
        const streamUrl = `${proxyUrlBase}?url=${encodeURIComponent(hlsUrl)}`;
        const subSubtitles = formatSubtitles(data.tracks || data.subtitles, proxyUrlBase);
        subSkip = formatSkipIntervals(data.intro, data.outro);

        streams.push({
          server: 'Protags Network [Sub]',
          link: streamUrl,
          type: 'm3u8',
          quality: '1080',
          headers: {
            'Referer': 'https://megaplay.buzz/',
            'referer': 'https://megaplay.buzz/',
            'Origin': 'https://megaplay.buzz',
            'origin': 'https://megaplay.buzz',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          },
          ...(subSubtitles ? { subtitles: subSubtitles } : {}),
          ...(subSkip ? { skip: subSkip } : {}),
        });
      }
    } catch (e) {
      console.warn('[protags-network stream] sub fetch failed:', e.message);
    }

    // 2. Fetch Dub version
    try {
      const dubRes = await axios.get(`${base}/api/megaplay/${dubPath}${refreshParam}`, reqConfig);
      const dubData = dubRes.data;
      const dubUrl = extractHlsUrl(dubData);

      if (dubUrl) {
        const dubSubtitles = formatSubtitles(dubData.tracks || dubData.subtitles, proxyUrlBase);
        const dubSkip = formatSkipIntervals(dubData.intro, dubData.outro) || subSkip;
        const dubStreamUrl = `${proxyUrlBase}?url=${encodeURIComponent(dubUrl)}`;

        streams.push({
          server: 'Protags Network [Dub]',
          link: dubStreamUrl,
          type: 'm3u8',
          quality: '1080',
          headers: {
            'Referer': 'https://megaplay.buzz/',
            'referer': 'https://megaplay.buzz/',
            'Origin': 'https://megaplay.buzz',
            'origin': 'https://megaplay.buzz',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
          },
          ...(dubSubtitles ? { subtitles: dubSubtitles } : {}),
          ...(dubSkip ? { skip: dubSkip } : {}),
        });
      }
    } catch (_) { /* dub optional */ }

    return streams;
  } catch (e) {
    console.warn('[protags-network stream] error:', e.message);
    return [];
  }
};