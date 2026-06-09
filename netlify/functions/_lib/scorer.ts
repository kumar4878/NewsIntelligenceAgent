// Relevance scoring and top-N selection per category
import type { Article } from "./rss-fetcher.js";
import type { Category } from "./sources.js";
import { TOP_N_PER_CATEGORY } from "./sources.js";

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  agriculture: [
    "agriculture", "farming", "farmer", "crop", "crops", "kharif", "rabi",
    "monsoon", "sowing", "harvest", "msp", "fertilizer", "fertiliser",
    "pesticide", "irrigation", "seed", "horticulture", "dairy", "livestock",
    "food grain", "mandi", "icar", "nabard", "agro", "agrochemical",
    "cotton", "wheat", "rice", "paddy", "sugarcane", "soybean", "agritech",
  ],
  ai: [
    "artificial intelligence", "machine learning", "deep learning",
    "generative ai", "llm", "gpt", "chatgpt", "openai", "neural network",
    "transformer", "computer vision", "nlp", "ai agent", "agentic",
    "nvidia", "gpu", "ai chip", "data science", "robotics", "automation",
    "ai startup", "ai regulation", "ai safety",
  ],
  business: [
    "economy", "gdp", "fiscal deficit", "budget", "rbi", "repo rate",
    "inflation", "sensex", "nifty", "stock market", "ipo", "exports",
    "imports", "fdi", "pmi", "manufacturing", "gst", "sebi",
    "startup funding", "venture capital", "unicorn", "merger",
    "quarterly results", "revenue", "profit", "earnings",
  ],
};

function countKeywordHits(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  return keywords.filter((kw) => lower.includes(kw)).length;
}

function recencyBoost(pubDate: Date): number {
  const ageHours = (Date.now() - pubDate.getTime()) / (1000 * 60 * 60);
  if (ageHours <= 6) return 1.0;
  if (ageHours <= 12) return 0.75;
  if (ageHours <= 24) return 0.5;
  return 0.2;
}

export interface ScoredArticle extends Article {
  score: number;
}

/**
 * Score each article and select top N per category.
 * Formula:
 *   score = (keywordHits / maxKeywords) * 0.4
 *         + sourceWeight * 0.35
 *         + recencyBoost * 0.25
 */
export function scoreAndSelect(articles: Article[]): ScoredArticle[] {
  // Group by category
  const byCategory = new Map<Category, Article[]>();
  for (const article of articles) {
    const list = byCategory.get(article.category) ?? [];
    list.push(article);
    byCategory.set(article.category, list);
  }

  const selected: ScoredArticle[] = [];

  for (const [category, items] of byCategory.entries()) {
    const keywords = CATEGORY_KEYWORDS[category];
    const maxKeywords = Math.min(keywords.length, 10); // normalise against 10

    const scored: ScoredArticle[] = items.map((article) => {
      const text = `${article.title} ${article.description}`;
      const hits = countKeywordHits(text, keywords);
      const kwScore = Math.min(hits / maxKeywords, 1.0);
      const score =
        kwScore * 0.4 +
        article.sourceWeight * 0.35 +
        recencyBoost(article.pubDate) * 0.25;
      return { ...article, score };
    });

    // Sort descending and take top N
    scored.sort((a, b) => b.score - a.score);
    const topN = scored.slice(0, TOP_N_PER_CATEGORY);
    selected.push(...topN);

    console.log(
      `[Score] ${category}: selected ${topN.length}/${items.length} articles` +
        (topN.length > 0 ? ` (top score: ${topN[0].score.toFixed(3)})` : "")
    );
  }

  return selected;
}
