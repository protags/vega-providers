// stream.js — resolves video stream URL via backend's Megaplay + M3U8-proxy pipeline

const LANG_MAP = {
  english:    'en',
  spanish:    'es',
  french:     'fr',
  german:     'de',
  italian:    'it',
  portuguese: 'pt',
  russian:    'ru',
  arabic:     'ar',
  japanese:   'ja',
  chinese:    'zh',
  korean:     'ko',
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

  const valid = tracks
    .filter(t => t && t.file && typeof t.file === 'string' && t.file.startsWith('http'))
    .map(t => {
      const label = t.label || t.name || 'English';
      const isVtt = t.file.includes('.vtt');
      // Route subtitle VTT URL through backend proxy to bypass Cloudflare HTTP 403
      const proxiedSubUrl = `${proxyUrlBase}?url=${encodeURIComponent(t.file.trim())}`;

      return {
        title:    label,
        language: getIsoLanguage(label),
        type:     isVtt ? 'text/vtt' : 'application/x-subrip',
        uri:      proxiedSubUrl,
      };
    });

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

  const episodePath = link.startsWith('mal/') ? link : `mal/${link}`;

  try {
    let base = 'https://cdn.originory.com';
    if (kvStore && typeof kvStore.get === 'function') {
      const storedUrl = await kvStore.get('serverUrl');
      if (storedUrl && typeof storedUrl === 'string' && storedUrl.trim()) {
        base = storedUrl.trim().replace(/\/+$/, '');
      }
    }

    const megaplayUrl  = `${base}/api/megaplay/${episodePath}`;
    const proxyUrlBase = `${base}/api/m3u8-proxy`;

    const res = await axios.get(megaplayUrl, {
      timeout: 20000,
      signal,
    });

    const data = res.data;
    if (!data) throw new Error('Empty response from Megaplay backend');

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

    if (!hlsUrl) throw new Error('No HLS URL in Megaplay response');

    const proxiedUrl = `${proxyUrlBase}?url=${encodeURIComponent(hlsUrl)}`;

    // Parse subtitles ONLY for Sub stream and route them through the backend proxy
    const subSubtitles = formatSubtitles(data.tracks || data.subtitles, proxyUrlBase);
    const subSkip      = formatSkipIntervals(data.intro, data.outro);

    const streams = [
      {
        server:   'Megaplay [Sub]',
        link:     proxiedUrl,
        type:     'm3u8',
        quality:  '1080',
        ...(subSubtitles ? { subtitles: subSubtitles } : {}),
        ...(subSkip ? { skip: subSkip } : {}),
      },
    ];

    // Check if Dub version is available
    if (episodePath.includes('/sub')) {
      const dubPath = episodePath.replace('/sub', '/dub');
      try {
        const dubRes = await axios.get(`${base}/api/megaplay/${dubPath}`, {
          timeout: 15000,
          signal,
        });
        const dubData = dubRes.data;
        let dubUrl = null;
        if (typeof dubData.sources === 'string') dubUrl = dubData.sources;
        else if (Array.isArray(dubData.sources)) dubUrl = dubData.sources[0]?.file || null;
        else if (dubData.sources?.file) dubUrl = dubData.sources.file;

        if (dubUrl) {
          // Dub stream: English audio, NO subtitles attached
          streams.push({
            server:  'Megaplay [Dub]',
            link:    `${proxyUrlBase}?url=${encodeURIComponent(dubUrl)}`,
            type:    'm3u8',
            quality: '1080',
            ...(subSkip ? { skip: subSkip } : {}),
          });
        }
      } catch (_) { /* dub optional */ }
    }

    return streams;
  } catch (e) {
    console.warn('[megaplay-anime stream] error:', e.message);
    return [];
  }
};
