// stream.js — resolves video stream URL via backend's Megaplay + M3U8-proxy pipeline

function formatSubtitles(tracks) {
  if (!Array.isArray(tracks)) return undefined;

  const valid = tracks
    .filter(t => t && t.file && (t.kind === 'captions' || t.kind === 'subtitles' || !t.kind))
    .map(t => ({
      title: t.label || t.name || 'English',
      language: 'en',
      type: (t.file && t.file.includes('.srt')) ? 'application/x-subrip' : 'text/vtt',
      uri: t.file
    }));

  return valid.length > 0 ? valid : undefined;
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

    const megaplayUrl = `${base}/api/megaplay/${episodePath}`;
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

    // Parse subtitles from Megaplay tracks ONLY for Sub stream
    const subSubtitles = formatSubtitles(data.tracks || data.subtitles);

    const streams = [
      {
        server: 'Megaplay [Sub]',
        link:   proxiedUrl,
        type:   'm3u8',
        quality: '1080',
        ...(subSubtitles ? { subtitles: subSubtitles } : {}),
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
          // Dub stream: English Audio, NO subtitles attached (as requested)
          streams.push({
            server: 'Megaplay [Dub]',
            link:   `${proxyUrlBase}?url=${encodeURIComponent(dubUrl)}`,
            type:   'm3u8',
            quality: '1080',
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
