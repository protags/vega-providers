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
`;

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

exports.getPosts = async function getPosts({ filter, page, providerValue, signal, providerContext }) {
  const { axios } = providerContext;

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
    const res = await axios.post(
      ANILIST_URL,
      { query, variables },
      { timeout: 10000, signal }
    );

    const mediaList = res.data?.data?.Page?.media || [];
    return mediaList.map(m => ({
      title: m.title?.english || m.title?.romaji || 'Anime',
      link:  `anilist:${m.id}:${m.idMal || m.id}`,
      image: m.coverImage?.extraLarge || m.coverImage?.large || '',
      tag:   m.format || 'TV',
      cornerTag: m.episodes ? `${m.episodes} EP` : null,
    }));
  } catch (e) {
    console.warn('[protags-network posts] error:', e.message);
    return [];
  }
};

exports.getSearchPosts = async function getSearchPosts({ searchQuery, page, providerValue, signal, providerContext }) {
  const { axios } = providerContext;

  try {
    const res = await axios.post(
      ANILIST_URL,
      { query: buildSearchQuery(), variables: { search: searchQuery, page: page || 1, perPage: 20 } },
      { timeout: 10000, signal }
    );

    const mediaList = res.data?.data?.Page?.media || [];
    return mediaList.map(m => ({
      title: m.title?.english || m.title?.romaji || 'Anime',
      link:  `anilist:${m.id}:${m.idMal || m.id}`,
      image: m.coverImage?.extraLarge || m.coverImage?.large || '',
      tag:   m.format || 'TV',
      cornerTag: m.episodes ? `${m.episodes} EP` : null,
    }));
  } catch (e) {
    console.warn('[protags-network getSearchPosts] error:', e.message);
    return [];
  }
};
