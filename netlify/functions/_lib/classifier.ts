// Category classification using keyword matching
// Articles can be multi-labeled but are assigned their strongest category
import type { Article } from "./rss-fetcher.js";
import type { Category } from "./sources.js";

interface KeywordSet {
  category: Category;
  strong: string[];  // high-confidence keywords (score 1.0)
  weak: string[];    // supporting keywords (score 0.5)
}

const KEYWORD_SETS: KeywordSet[] = [
  {
    category: "agriculture",
    strong: [
      "agriculture", "farming", "farmer", "crop", "crops", "kharif", "rabi",
      "monsoon", "sowing", "harvest", "msp", "minimum support price",
      "agri-tech", "agritech", "fertilizer", "fertiliser", "pesticide",
      "irrigation", "seed", "seeds", "horticulture", "dairy", "livestock",
      "food grain", "foodgrain", "procurement", "mandi", "apmc",
      "cotton", "wheat", "rice", "paddy", "sugarcane", "soybean",
      "pulses", "oilseed", "plantation", "tea", "coffee", "spices",
      "icar", "nabard", "krishi", "pm-kisan", "pm kisan",
      "agro", "agrochemical", "fungicide", "insecticide", "herbicide",
      "soil health", "drip irrigation", "cold storage", "food processing",
      "rural development", "agricultural",
    ],
    weak: [
      "rain", "rainfall", "weather", "drought", "flood", "cyclone",
      "imd", "forecast", "rural", "village", "organic",
      "commodity", "farm", "cultivation", "yield",
    ],
  },
  {
    category: "ai",
    strong: [
      "artificial intelligence", "machine learning", "deep learning",
      "generative ai", "gen ai", "genai", "large language model", "llm",
      "gpt", "chatgpt", "openai", "anthropic", "claude", "gemini",
      "neural network", "transformer", "diffusion model",
      "computer vision", "natural language processing", "nlp",
      "ai agent", "agentic", "autonomous agent", "copilot",
      "ai startup", "ai regulation", "ai safety", "ai ethics",
      "machine intelligence", "robotics", "automation",
      "nvidia", "gpu", "tensor", "ai chip",
      "data science", "predictive analytics",
    ],
    weak: [
      "algorithm", "model", "training", "inference", "ai",
      "tech", "technology", "digital", "cloud", "saas",
      "startup", "innovation", "semiconductor",
    ],
  },
  {
    category: "business",
    strong: [
      "economy", "gdp", "fiscal deficit", "union budget", "budget",
      "rbi", "reserve bank", "monetary policy", "repo rate", "inflation",
      "sensex", "nifty", "bse", "nse", "stock market", "ipo",
      "exports", "imports", "trade deficit", "current account",
      "fdi", "foreign direct investment", "make in india",
      "pmi", "manufacturing", "industrial production", "iip",
      "gst", "tax", "taxation", "corporate tax",
      "sebi", "mutual fund", "insurance", "banking",
      "startup funding", "venture capital", "series a", "series b",
      "unicorn", "acquisition", "merger",
      "infosys", "tcs", "reliance", "adani", "tata",
      "quarterly results", "revenue", "profit", "earnings",
      "employment", "unemployment", "jobs",
    ],
    weak: [
      "india", "indian", "market", "growth", "investment",
      "finance", "company", "business", "sector", "industry",
      "policy", "government", "ministry", "regulation",
    ],
  },
];

interface ClassificationResult {
  category: Category;
  score: number;
}

function classifyText(text: string): ClassificationResult[] {
  const lower = text.toLowerCase();
  const results: ClassificationResult[] = [];

  for (const ks of KEYWORD_SETS) {
    let score = 0;
    let strongHits = 0;
    let weakHits = 0;

    for (const keyword of ks.strong) {
      if (lower.includes(keyword)) {
        score += 1.0;
        strongHits++;
      }
    }
    for (const keyword of ks.weak) {
      if (lower.includes(keyword)) {
        score += 0.5;
        weakHits++;
      }
    }

    if (strongHits > 0 || weakHits >= 2) {
      results.push({ category: ks.category, score });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Classify and filter articles by category.
 * Each article gets assigned to its best-matching category.
 * Articles with no category match are discarded.
 */
export function classifyArticles(articles: Article[]): Article[] {
  const classified: Article[] = [];

  for (const article of articles) {
    const searchText = `${article.title} ${article.description}`;
    const results = classifyText(searchText);

    if (results.length > 0) {
      // Assign the strongest category (may override source-based category)
      article.category = results[0].category;
      classified.push(article);
    } else {
      // Fallback: keep original source-based category
      classified.push(article);
    }
  }

  const discarded = articles.length - classified.length;
  console.log(`[Classify] ${classified.length} articles classified, ${discarded} discarded`);
  return classified;
}
