// search.js — standalone search module for Protags Network provider
// Both vega-app and vega-desktop call this via GetSearchPosts

const ANILIST_URL = 'https://graphql.anilist.co';

const SEARCH_QUERY = `
  query ($page: Int, $perPage: Int, $search: String) {
    Page(page: $page, perPage: $perPage) {
      media(type: ANIME, search: $search, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
        id idMal
        title { english romaji }
        coverImage { extraLarge large }
        episodes format status
      }
    }
  }
`;

module.exports = async function search({ searchQuery, page, providerValue, signal, providerContext }) {
  const { axios } = providerContext;

  try {
    const reqConfig = { timeout: 10000 };
    if (signal) reqConfig.signal = signal;

    const res = await axios.post(
      ANILIST_URL,
      { query: SEARCH_QUERY, variables: { page: page || 1, perPage: 20, search: searchQuery } },
      reqConfig
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
    console.warn('[protags-network search] error:', e.message);
    return [];
  }
};
