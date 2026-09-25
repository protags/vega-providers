// meta.js — fetches detailed anime metadata from AniList GraphQL
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

const cleanHtml = (str) => {
  if (!str) return 'No description available.';
  return str.replace(/<[^>]*>?/gm, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
};

exports.getMeta = async function getMeta({ link, providerContext }) {
  const { axios } = providerContext;

  const parts = link.split(':');
  const anilistId = parseInt(parts[1], 10);
  const malId     = parseInt(parts[2] || parts[1], 10);

  try {
    const res = await axios.post(
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

    const totalEpisodes = m.episodes || m.streamingEpisodes?.length || 24;

    const linkList = [{
      title: title,
      quality: `${totalEpisodes} Episodes`,
      episodesLink: `episodes:${anilistId}:${malId}`,
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
    console.warn('[megaplay-anime meta] error:', e.message);
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
