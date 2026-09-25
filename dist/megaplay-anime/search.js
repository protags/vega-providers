// search.js — used internally by the posts.js "search" path; the vega-app calls posts.js
// with filter="search:{query}" but this file can also serve as a standalone search helper.
// In vega-app, GetSearchPosts maps to the posts module called with filter="search:{query}".
// Provider: Protags Network

const ANILIST_URL = '/api/anilist';

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
    const base = await providerContext.getBaseUrl(providerValue || 'megaplay-anime');
    const url  = `${base}${ANILIST_URL}`;

    const res = await axios.post(
      url,
      { query: SEARCH_QUERY, variables: { page: page || 1, perPage: 20, search: searchQuery } },
      { timeout: 10000 }
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
