// catalog.js — returns the list of content categories for the home page
exports.catalog = [
  { title: "🔥 Trending Now",     filter: "trending"    },
  { title: "⭐ Most Popular",      filter: "popular"     },
  { title: "📅 Currently Airing", filter: "airing"      },
  { title: "🗓️ Upcoming Anime",   filter: "upcoming"    },
  { title: "🎬 Top Rated",         filter: "top_rated"   },
  { title: "🏆 All-Time Greats",   filter: "all_time"    },
];

exports.genres = [
  { title: "Action",    filter: "genre:Action"    },
  { title: "Adventure", filter: "genre:Adventure" },
  { title: "Comedy",    filter: "genre:Comedy"    },
  { title: "Fantasy",   filter: "genre:Fantasy"   },
  { title: "Romance",   filter: "genre:Romance"   },
  { title: "Sci-Fi",    filter: "genre:Sci-Fi"    },
];
