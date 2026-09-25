// stream.js — resolves video stream URL via backend's Megaplay + M3U8-proxy pipeline

const LANG_MAP = {
  english:    'en',
  eng:        'en',
  spanish:    'es',
  spa:        'es',
  french:     'fr',
  fre:        'fr',
  fra:        'fr',
  german:     'de',
  ger:        'de',
  deu:        'de',
  italian:    'it',
  ita:        'it',
  portuguese: 'pt',
  por:        'pt',
  russian:    'ru',
  rus:        'ru',
  arabic:     'ar',
  ara:        'ar',
  japanese:   'ja',
  jap:        'ja',
  jpn:        'ja',
  chinese:    'zh',
  chi:        'zh',
  zho:        'zh',
  korean:     'ko',
  kor:        'ko',
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
      title:    label,
      language: getIsoLanguage(label),
      type:     isVtt ? 'text/vtt' : 'application/x-subrip',
      uri:      proxiedSubUrl,
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

exports.getStream = async function getStream({ link, type, signal, providerContext, isDownload }) {
  const { axios, kvStore } = providerContext;

  const rawPath = link.startsWith('mal/') ? link : `mal/${link}`;
  const subPath = rawPath.includes('/dub') ? rawPath.replace('/dub', '/sub') : (rawPath.includes('/sub') ? rawPath : `${rawPath}/sub`);
  const dubPath = subPath.replace('/sub', '/dub');

  try {
    let base = 'https://cdn.originory.com';
    if (kvStore && typeof kvStore.get === 'function') {
      const storedUrl = await kvStore.get('serverUrl');
      if (storedUrl && typeof storedUrl === 'string' && storedUrl.trim()) {
        base = storedUrl.trim().replace(/\/+$/, '');
      }
    }

    const proxyUrlBase = `${base}/api/m3u8-proxy`;
    const streams = [];

    // 1. Fetch Sub version
    let subSkip = undefined;
    try {
      const subRes = await axios.get(`${base}/api/megaplay/${subPath}`, {
        timeout: 20000,
        signal,
      });

      const data = subRes.data;
      if (data) {
        let hlsUrl = null;
        if (typeof data.sources === 'string') {
          hlsUrl = data.sources;
        } else if (Array.isArray(data.sources)) {
          const hls = data.sources.find(s => s.type === 'hls' || s.file?.includes('.m3u8')) || data.sources[0];
          hlsUrl = hls?.file || hls?.src || null;
        } else if (data.sources?.file) {
          hlsUrl = data.sources.file;
        } else if (data.sources?.src) {
          hlsUrl = data.sources.src;
        }

        if (hlsUrl) {
          const proxiedUrl = `${proxyUrlBase}?url=${encodeURIComponent(hlsUrl)}`;
          const subSubtitles = formatSubtitles(data.tracks || data.subtitles, proxyUrlBase);
          subSkip = formatSkipIntervals(data.intro, data.outro);

          streams.push({
            server:   'Protags Network [Sub]',
            link:     proxiedUrl,
            type:     'm3u8',
            quality:  '1080',
            ...(subSubtitles ? { subtitles: subSubtitles } : {}),
            ...(subSkip ? { skip: subSkip } : {}),
          });
        }
      }
    } catch (e) {
      console.warn('[megaplay-anime stream] sub fetch failed:', e.message);
    }

    // 2. Fetch Dub version
    try {
      const dubRes = await axios.get(`${base}/api/megaplay/${dubPath}`, {
        timeout: 15000,
        signal,
      });

      const dubData = dubRes.data;
      if (dubData) {
        let dubUrl = null;
        if (typeof dubData.sources === 'string') dubUrl = dubData.sources;
        else if (Array.isArray(dubData.sources)) {
          const hls = dubData.sources.find(s => s.type === 'hls' || s.file?.includes('.m3u8')) || dubData.sources[0];
          dubUrl = hls?.file || hls?.src || null;
        } else if (dubData.sources?.file) dubUrl = dubData.sources.file;
        else if (dubData.sources?.src) dubUrl = dubData.sources.src;

        if (dubUrl) {
          const dubSubtitles = formatSubtitles(dubData.tracks || dubData.subtitles, proxyUrlBase);
          const dubSkip = formatSkipIntervals(dubData.intro, dubData.outro) || subSkip;

          streams.push({
            server:  'Protags Network [Dub]',
            link:    `${proxyUrlBase}?url=${encodeURIComponent(dubUrl)}`,
            type:    'm3u8',
            quality: '1080',
            ...(dubSubtitles ? { subtitles: dubSubtitles } : {}),
            ...(dubSkip ? { skip: dubSkip } : {}),
          });
        }
      }
    } catch (_) { /* dub optional */ }

    return streams;
  } catch (e) {
    console.warn('[megaplay-anime stream] error:', e.message);
    return [];
  }
};
