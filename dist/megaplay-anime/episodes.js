// episodes.js — fetches episode list from AniList + Jikan for Protags Network
// url format: "episodes:{anilistId}:{malId}"

const JIKAN_URL = 'https://api.jikan.moe/v4';
const ANILIST_URL = 'https://graphql.anilist.co';

const EPISODE_QUERY = `
  query ($id: Int) {
    Media(id: $id, type: ANIME) {
      bannerImage
      coverImage { extraLarge large }
      episodes
      description
      streamingEpisodes { title thumbnail site url }
    }
  }
`;

const cleanHtml = (str) => {
  if (!str) return '';
  return str.replace(/<[^>]*>?/gm, '').replace(/&quot;/g, '"').replace(/&#039;/g, "'").slice(0, 200);
};

exports.getEpisodes = async function getEpisodes({ url, providerContext }) {
  const { axios } = providerContext;

  const parts     = url.split(':');
  const anilistId = parseInt(parts[1], 10);
  const malId     = parseInt(parts[2] || parts[1], 10);

  try {
    const aniRes = await axios.post(
      ANILIST_URL,
      { query: EPISODE_QUERY, variables: { id: anilistId } },
      { timeout: 10000 }
    );

    const media            = aniRes.data?.data?.Media;
    const streamingEps     = media?.streamingEpisodes || [];
    const defaultThumbnail = media?.bannerImage || media?.coverImage?.extraLarge || media?.coverImage?.large || '';
    const totalEpisodes    = media?.episodes || Math.max(streamingEps.length, 1);
    const mainSynopsis     = cleanHtml(media?.description || '');

    let jikanMap = new Map();
    try {
      const jikanRes = await axios.get(`${JIKAN_URL}/anime/${malId}/episodes`, { timeout: 5000 });
      (jikanRes.data?.data || []).forEach(ep => {
        if (ep.mal_id) jikanMap.set(ep.mal_id, ep);
      });
    } catch (_) { /* Jikan optional */ }

    const count = Math.max(totalEpisodes, streamingEps.length, jikanMap.size, 1);
    const episodeList = [];

    for (let i = 1; i <= count; i++) {
      const streamEp = streamingEps.find(s => {
        const m = s.title?.match(/Episode\s+(\d+)/i);
        return m ? parseInt(m[1], 10) === i : false;
      }) || streamingEps[i - 1];

      const jikanEp  = jikanMap.get(i);
      let rawTitle   = jikanEp?.title || streamEp?.title || `Episode ${i}`;
      rawTitle       = rawTitle.replace(/^Episode\s+\d+\s*[-:]*\s*/i, '').trim();
      if (!rawTitle) rawTitle = `Episode ${i}`;

      const synopsis = jikanEp?.synopsis
        || (mainSynopsis ? `${mainSynopsis.slice(0, 160)}...` : `Watch Episode ${i} in HD.`);

      episodeList.push({
        id:          `${malId}-${i}-sub`,
        title:       rawTitle,
        link:        `mal/${malId}/${i}/sub`,
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
