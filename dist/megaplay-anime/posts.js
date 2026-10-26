// posts.js — fetches anime lists & handles search directly via AniList GraphQL for Protags Network
const ANILIST_URL = 'https://graphql.anilist.co';

const FILTER_MAP = {
  trending:  { sort: 'TRENDING_DESC',   status: null },
  popular:   { sort: 'POPULARITY_DESC', status: null },
  airing:    { sort: 'TRENDING_DESC',   status: 'RELEASING' },
  upcoming:  { sort: 'POPULARITY_DESC', status: 'NOT_YET_RELEASED' },
  top_rated: { sort: 'SCORE_DESC',      status: null },
  all_time:  { sort: 'FAVOURITES_DESC', status: null },
};

const ANIME_FIELDS = `
  id idMal
  title { english romaji }
  coverImage { extraLarge large }
  bannerImage
  episodes averageScore genres format status seasonYear
  nextAiringEpisode { episode }
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

const getEpisodeCount = (m) => {
  let count = m.episodes || 0;
  if (!count && m.nextAiringEpisode?.episode) {
    count = m.nextAiringEpisode.episode - 1;
  }
  const malId = m.idMal || m.id;
  if (!count && KNOWN_EPISODE_COUNTS[malId]) count = KNOWN_EPISODE_COUNTS[malId];
  if (!count && KNOWN_EPISODE_COUNTS[m.id]) count = KNOWN_EPISODE_COUNTS[m.id];
  return count > 0 ? count : null;
};

const buildQuery = (sort, status) => {
  const statusArg = status ? `, status: ${status}` : '';
  return `
    query ($page: Int, $perPage: Int) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, sort: ${sort}${statusArg}) {
          ${ANIME_FIELDS}
        }
      }
    }
  `;
};

const buildGenreQuery = (genre) => `
  query ($page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, genre: "${genre}", sort: POPULARITY_DESC) {
        ${ANIME_FIELDS}
      }
    }
  }
`;

const buildSearchQuery = () => `
  query ($search: String, $page: Int, $perPage: Int) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, search: $search) {
        ${ANIME_FIELDS}
      }
    }
  }
`;

exports.getPosts = async function getPosts({ filter, page, providerValue, signal, providerContext = {} }) {
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

  let query;
  let variables = { page: page || 1, perPage: 20 };

  if (filter && filter.startsWith('genre:')) {
    const genre = filter.replace('genre:', '');
    query = buildGenreQuery(genre);
  } else {
    const cfg = FILTER_MAP[filter] || FILTER_MAP.trending;
    query = buildQuery(cfg.sort, cfg.status);
  }

  try {
    const res = await http.post(
      ANILIST_URL,
      { query, variables },
      { timeout: 10000, signal }
    );

    const mediaList = res.data?.data?.Page?.media || [];
    return mediaList.map(m => {
      const epCount = getEpisodeCount(m);
      return {
        title: m.title?.english || m.title?.romaji || 'Anime',
        link:  `anilist:${m.id}:${m.idMal || m.id}`,
        image: m.coverImage?.extraLarge || m.coverImage?.large || '',
        tag:   m.format || 'TV',
        cornerTag: epCount ? `${epCount} EP` : null,
      };
    });
  } catch (e) {
    console.warn('[protags-network posts] error:', e.message);
    return [];
  }
};

exports.getSearchPosts = async function getSearchPosts({ searchQuery, page, providerValue, signal, providerContext = {} }) {
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

  try {
    const res = await http.post(
      ANILIST_URL,
      { query: buildSearchQuery(), variables: { search: searchQuery, page: page || 1, perPage: 20 } },
      { timeout: 10000, signal }
    );

    const mediaList = res.data?.data?.Page?.media || [];
    return mediaList.map(m => {
      const epCount = getEpisodeCount(m);
      return {
        title: m.title?.english || m.title?.romaji || 'Anime',
        link:  `anilist:${m.id}:${m.idMal || m.id}`,
        image: m.coverImage?.extraLarge || m.coverImage?.large || '',
        tag:   m.format || 'TV',
        cornerTag: epCount ? `${epCount} EP` : null,
      };
    });
  } catch (e) {
    console.warn('[protags-network getSearchPosts] error:', e.message);
    return [];
  }
};
