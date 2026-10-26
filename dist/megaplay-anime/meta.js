// meta.js — fetches detailed anime metadata from AniList GraphQL for Protags Network
// link format: "anilist:{anilistId}:{malId}"

const ANILIST_URL = 'https://graphql.anilist.co';

const META_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      id idMal
      title { english romaji native }
      coverImage { extraLarge large }
      bannerImage
      description episodes averageScore genres format status seasonYear
      nextAiringEpisode { episode }
      startDate { year }
      studios(isMain: true) { nodes { name } }
      characters(perPage: 6, sort: ROLE) {
        edges {
          role
          node { id name { full } image { medium } }
        }
      }
      recommendations(perPage: 6, sort: RATING_DESC) {
        nodes {
          mediaRecommendation {
            id idMal
            title { english romaji }
            coverImage { extraLarge large }
            format episodes averageScore
          }
        }
      }
      streamingEpisodes { title thumbnail site }
    }
  }
`;

const KNOWN_EPISODE_COUNTS = {
  21: 1122,     // One Piece
  235: 1150,    // Detective Conan
  2406: 7500,   // Sazae-san
  2471: 1787,   // Doraemon 1979
  8687: 1000,   // Doraemon 2005
  6149: 1400,   // Chibi Maruko-chan
  2735: 1200,   // Crayon Shin-chan
  1960: 1600,   // Soreike! Anpanman
  1199: 2300,   // Nintama Rantaro
  20: 220,      // Naruto
  1735: 500,    // Naruto: Shippuden
  97938: 293,   // Boruto
  34566: 293,   // Boruto MAL
  269: 366,     // Bleach
  223: 153,     // Dragon Ball
  813: 291,     // Dragon Ball Z
  225: 64,      // Dragon Ball GT
  21175: 131,   // Dragon Ball Super
  30694: 131,   // Dragon Ball Super MAL
  918: 201,     // Gintama
  11061: 148,   // Hunter x Hunter 2011
  136: 62,      // Hunter x Hunter 1999
  6702: 175,    // Fairy Tail
  97940: 170,   // Black Clover
  34572: 170,   // Black Clover MAL
  527: 276,     // Pokemon 1997
  481: 224,     // Yu-Gi-Oh! Duel Monsters
  249: 167,     // Inuyasha
  10033: 147,   // Toriko
  22: 178,      // Prince of Tennis
  1482: 103,    // D.Gray-man
  1604: 203,    // Katekyo Hitman Reborn!
  170: 101,     // Slam Dunk
  530: 200,     // Sailor Moon
  392: 112,     // Yu Yu Hakusho
};

const cleanHtml = (str) => {
  if (!str) return 'No description available.';
  return str.replace(/<[^>]*>?/gm, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

exports.getMeta = async function getMeta({ link, providerContext = {} }) {
  const http = (providerContext && providerContext.axios) ? providerContext.axios : {
    post: async (targetUrl, body, config) => {
      const res = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config?.headers || {}) },
        body: JSON.stringify(body),
        signal: config?.signal,
      });
      return { data: await res.json() };
    }
  };

  const parts = link.split(':');
  const anilistId = parseInt(parts[1], 10);
  const malId     = parseInt(parts[2] || parts[1], 10);

  try {
    const res = await http.post(
      ANILIST_URL,
      { query: META_QUERY, variables: { id: anilistId } },
      { timeout: 12000 }
    );

    const m = res.data?.data?.Media;
    if (!m) throw new Error('No media data from AniList');

    const title = m.title?.english || m.title?.romaji || 'Anime';
    const studio = m.studios?.nodes?.[0]?.name || '';
    const score  = m.averageScore ? `${(m.averageScore / 10).toFixed(1)}/10` : '';
    const tags   = [
      m.format, studio, score,
      ...(m.genres || []).slice(0, 3),
    ].filter(Boolean);

    let totalEpisodes = m.episodes || 0;
    if (m.nextAiringEpisode?.episode) {
      totalEpisodes = Math.max(totalEpisodes, m.nextAiringEpisode.episode - 1);
    }
    const resolvedMal = m.idMal || malId;
    const resolvedAni = m.id || anilistId;
    if (resolvedMal && KNOWN_EPISODE_COUNTS[resolvedMal]) {
      totalEpisodes = Math.max(totalEpisodes, KNOWN_EPISODE_COUNTS[resolvedMal]);
    }
    if (resolvedAni && KNOWN_EPISODE_COUNTS[resolvedAni]) {
      totalEpisodes = Math.max(totalEpisodes, KNOWN_EPISODE_COUNTS[resolvedAni]);
    }
    if (!totalEpisodes) {
      totalEpisodes = m.streamingEpisodes?.length || 24;
    }

    const linkList = [{
      title: title,
      quality: `${totalEpisodes} Episodes`,
      episodesLink: `episodes:${anilistId}:${malId}`,
      quickDownload: true,
    }];

    return {
      title,
      image:    m.coverImage?.extraLarge || m.coverImage?.large || '',
      poster:   m.bannerImage || m.coverImage?.extraLarge || '',
      synopsis: cleanHtml(m.description),
      type:     m.format || 'TV',
      tags,
      cast: (m.characters?.edges || [])
        .map(e => e.node?.name?.full)
        .filter(Boolean),
      linkList,
      imdbId:   String(malId),
      tmdbId:   anilistId,
      webUrl:   `https://anilist.co/anime/${anilistId}`,
    };
  } catch (e) {
    console.warn('[protags-network meta] error:', e.message);
    return {
      title: 'Anime',
      image: '',
      synopsis: 'Failed to load anime details.',
      type: 'TV',
      tags: [],
      linkList: [],
    };
  }
};
