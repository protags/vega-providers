// episodes.js — fetches episode list from AniList + Jikan for Protags Network
// url format: "episodes:{anilistId}:{malId}" or numeric/path formats

const JIKAN_URL = 'https://api.jikan.moe/v4';
const ANILIST_URL = 'https://graphql.anilist.co';

const EPISODE_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id
      idMal
      status
      episodes
      nextAiringEpisode { episode airingAt }
      bannerImage
      coverImage { extraLarge large }
      description
      streamingEpisodes { title thumbnail site url }
    }
  }
`;

const EPISODE_QUERY_MAL = `
  query ($idMal: Int) {
    Media(idMal: $idMal, type: ANIME) {
      id
      idMal
      status
      episodes
      nextAiringEpisode { episode airingAt }
      bannerImage
      coverImage { extraLarge large }
      description
      streamingEpisodes { title thumbnail site url }
    }
  }
`;

// Curated episode count thresholds for major long-running / big anime
const KNOWN_EPISODE_COUNTS = {
  // One Piece
  21: 1122,
  // Detective Conan / Case Closed
  235: 1150,
  // Sazae-san
  2406: 7500,
  // Doraemon
  2471: 1787,
  8687: 1000,
  // Chibi Maruko-chan
  6149: 1400,
  // Crayon Shin-chan
  2735: 1200,
  // Soreike! Anpanman
  1960: 1600,
  // Nintama Rantaro
  1199: 2300,
  // Naruto
  20: 220,
  // Naruto: Shippuden
  1735: 500,
  // Boruto: Naruto Next Generations
  97938: 293,
  34566: 293,
  // Bleach
  269: 366,
  // Dragon Ball
  223: 153,
  // Dragon Ball Z
  813: 291,
  // Dragon Ball GT
  225: 64,
  // Dragon Ball Super
  21175: 131,
  30694: 131,
  // Gintama
  918: 201,
  // Hunter x Hunter (2011)
  11061: 148,
  // Hunter x Hunter (1999)
  136: 62,
  // Fairy Tail
  6702: 175,
  17513: 102,
  27755: 102,
  10321: 51,
  // Black Clover
  97940: 170,
  34572: 170,
  // Pokémon (1997)
  527: 276,
  // Yu-Gi-Oh! Duel Monsters
  481: 224,
  // Inuyasha
  249: 167,
  // Toriko
  10033: 147,
  // Prince of Tennis
  22: 178,
  // D.Gray-man
  1482: 103,
  // Katekyo Hitman Reborn!
  1604: 203,
  // Slam Dunk
  170: 101,
  // Sailor Moon
  530: 200,
  // Yu Yu Hakusho
  392: 112,
  // Kochira Katsushikaku
  373: 373,
  // Keroro Gunsou
  358: 358,
  // Major
  627: 154,
  // Diamond no Ace
  18689: 75,
  // Eyeshield 21
  15: 145,
  // Inazuma Eleven
  5231: 127,
  // Space Brothers
  12431: 99,
  // Monster
  19: 74,
};

const cleanHtml = (str) => {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").slice(0, 200);
};

exports.getEpisodes = async function getEpisodes({ url, providerContext = {} }) {
  const http = (providerContext && providerContext.axios) ? providerContext.axios : {
    post: async (targetUrl, body, config) => {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config?.headers || {}) },
        body: JSON.stringify(body),
        signal: config?.signal,
      });
      return { data: await res.json() };
    },
    get: async (targetUrl, config) => {
      const res = await fetch(targetUrl, {
        headers: config?.headers,
        signal: config?.signal,
      });
      return { data: await res.json() };
    }
  };

  let anilistId = null;
  let malId = null;

  if (typeof url === 'number') {
    anilistId = url;
    malId = url;
  } else if (typeof url === 'string') {
    const clean = url.trim();
    if (clean.startsWith('episodes:')) {
      const parts = clean.split(':');
      anilistId = parseInt(parts[1], 10);
      malId = parseInt(parts[2] || parts[1], 10);
    } else if (clean.startsWith('mal/')) {
      malId = parseInt(clean.split('/')[1], 10);
      anilistId = malId;
    } else if (clean.startsWith('ani/')) {
      anilistId = parseInt(clean.split('/')[1], 10);
      malId = anilistId;
    } else if (!isNaN(clean)) {
      anilistId = parseInt(clean, 10);
      malId = anilistId;
    }
  }

  if (!anilistId && !malId) {
    return [];
  }

  try {
    let media = null;

    if (anilistId) {
      try {
        const aniRes = await http.post(
          ANILIST_URL,
          { query: EPISODE_QUERY, variables: { id: anilistId } },
          { timeout: 10000 }
        );
        media = aniRes.data?.data?.Media;
      } catch (_) {}
    }

    if (!media && malId) {
      try {
        const aniMalRes = await http.post(
          ANILIST_URL,
          { query: EPISODE_QUERY_MAL, variables: { idMal: malId } },
          { timeout: 10000 }
        );
        media = aniMalRes.data?.data?.Media;
      } catch (_) {}
    }

    const streamingEps     = media?.streamingEpisodes || [];
    const defaultThumbnail = media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || '';
    const mainSynopsis     = cleanHtml(media?.description || '');
    const resolvedMal      = media?.idMal || malId || anilistId;
    const resolvedAni      = media?.id || anilistId || malId;

    // Optional Jikan fetch for titles / synopses
    let jikanMap = new Map();
    if (resolvedMal) {
      try {
        const jikanRes = await http.get(`${JIKAN_URL}/anime/${resolvedMal}/episodes`, { timeout: 4000 });
        (jikanRes.data?.data || []).forEach(ep => {
          if (ep.mal_id) jikanMap.set(ep.mal_id, ep);
        });
      } catch (_) { /* Jikan optional */ }
    }

    // Determine full total episode count:
    // 1. Explicit episodes count from AniList
    let totalEpisodes = media?.episodes || 0;

    // 2. Airing anime: nextAiringEpisode.episode - 1 gives currently released episode count
    if (media?.nextAiringEpisode?.episode) {
      const aired = media.nextAiringEpisode.episode - 1;
      totalEpisodes = Math.max(totalEpisodes, aired);
    }

    // 3. Fallback to known big anime database
    if (resolvedMal && KNOWN_EPISODE_COUNTS[resolvedMal]) {
      totalEpisodes = Math.max(totalEpisodes, KNOWN_EPISODE_COUNTS[resolvedMal]);
    }
    if (resolvedAni && KNOWN_EPISODE_COUNTS[resolvedAni]) {
      totalEpisodes = Math.max(totalEpisodes, KNOWN_EPISODE_COUNTS[resolvedAni]);
    }

    // 4. Consider streaming episodes and Jikan map
    const count = Math.max(totalEpisodes, streamingEps.length, jikanMap.size, 1);

    // Build O(1) streaming episode lookup map by episode number
    const streamMap = new Map();
    streamingEps.forEach((s, idx) => {
      const m = s.title?.match(/Episode\s+(\d+)/i);
      const epNum = m ? parseInt(m[1], 10) : (idx + 1);
      if (!streamMap.has(epNum)) {
        streamMap.set(epNum, s);
      }
    });

    const episodeList = [];

    for (let i = 1; i <= count; i++) {
      const streamEp = streamMap.get(i) || (i <= streamingEps.length ? streamingEps[i - 1] : null);
      const jikanEp  = jikanMap.get(i);

      let rawTitle = jikanEp?.title || streamEp?.title || `Episode ${i}`;
      rawTitle = rawTitle.replace(/^Episode\s+\d+\s*[-:]*\s*/i, '').trim();
      if (!rawTitle) rawTitle = `Episode ${i}`;

      const synopsis = jikanEp?.synopsis
        || (mainSynopsis ? `${mainSynopsis.slice(0, 160)}...` : `Watch Episode ${i} in HD.`);

      episodeList.push({
        id:          `${resolvedMal}-${i}-sub`,
        number:      i,
        title:       rawTitle,
        link:        `mal/${resolvedMal}/${i}/sub`,
        description: synopsis,
        image:       streamEp?.thumbnail || defaultThumbnail,
        quickDownload: true,
      });
    }

    return episodeList;
  } catch (e) {
    console.warn('[protags-network episodes] error:', e.message);
    return [];
  }
};
