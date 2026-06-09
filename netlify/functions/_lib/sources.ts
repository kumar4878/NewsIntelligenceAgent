// RSS source configuration for the News Intelligence Agent
// Each source has a name, URL, primary category, authority weight (0-1), and fallback flag

export type Category = "agriculture" | "ai" | "business";

export interface RssSource {
  name: string;
  url: string;
  category: Category;
  weight: number; // 0.0 – 1.0, used in relevance scoring
  description?: string;
}

export const RSS_SOURCES: RssSource[] = [
  // ── Agriculture (High Priority) ──────────────────────────────────────────
  {
    name: "PIB – Agriculture",
    url: "https://pib.gov.in/RssMain.aspx?ModId=6&Lang=1&Regid=3",
    category: "agriculture",
    weight: 1.0,
    description: "Press Information Bureau – Ministry of Agriculture releases",
  },
  {
    name: "The Hindu BusinessLine – Agri Business",
    url: "https://www.thehindubusinessline.com/economy/agri-business/?service=rss",
    category: "agriculture",
    weight: 0.9,
    description: "BusinessLine agriculture & agri-business section",
  },
  {
    name: "Economic Times – Agriculture",
    url: "https://economictimes.indiatimes.com/news/economy/agriculture/rssfeeds/13357270.cms",
    category: "agriculture",
    weight: 0.85,
    description: "ET Agriculture news",
  },
  {
    name: "Krishi Jagran",
    url: "https://www.krishijagran.com/feed/",
    category: "agriculture",
    weight: 0.8,
    description: "Indian agriculture news and farm advisory",
  },

  // ── Artificial Intelligence (High Priority) ──────────────────────────────
  {
    name: "Analytics India Magazine",
    url: "https://analyticsindiamag.com/feed/",
    category: "ai",
    weight: 0.95,
    description: "Indian AI, ML & data science news",
  },
  {
    name: "The Hindu BusinessLine – Tech",
    url: "https://www.thehindubusinessline.com/info-tech/?service=rss",
    category: "ai",
    weight: 0.85,
    description: "Technology and AI from BusinessLine",
  },
  {
    name: "TechCrunch – AI",
    url: "https://techcrunch.com/feed/",
    category: "ai",
    weight: 0.75,
    description: "Global AI/tech news",
  },
  {
    name: "MIT Technology Review",
    url: "https://www.technologyreview.com/feed/",
    category: "ai",
    weight: 0.8,
    description: "Deep AI research and industry news",
  },

  // ── Indian Business (High Priority) ──────────────────────────────────────
  {
    name: "PIB – Economy",
    url: "https://pib.gov.in/RssMain.aspx?ModId=2&Lang=1&Regid=3",
    category: "business",
    weight: 1.0,
    description: "PIB Ministry of Finance & economic releases",
  },
  {
    name: "Business Standard",
    url: "https://www.business-standard.com/rss/home_page_top_stories.rss",
    category: "business",
    weight: 0.9,
    description: "Top Indian business news",
  },
  {
    name: "Economic Times – Economy",
    url: "https://economictimes.indiatimes.com/news/economy/rssfeeds/1977021501.cms",
    category: "business",
    weight: 0.88,
    description: "Economy news from Economic Times",
  },
  {
    name: "Livemint – Markets",
    url: "https://www.livemint.com/rss/markets",
    category: "business",
    weight: 0.82,
    description: "Indian market and business news",
  },
];

export const TOP_N_PER_CATEGORY = 3; // articles to select per category for summarization
