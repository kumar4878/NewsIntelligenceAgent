// Parallel RSS feed fetcher with timeout and graceful error handling
import Parser from "rss-parser";
import { RSS_SOURCES, type RssSource, type Category } from "./sources.js";

export interface Article {
  id: string;           // hash of URL for dedup
  title: string;
  link: string;
  source: string;       // source name
  sourceDomain: string; // domain for dedup
  category: Category;
  pubDate: Date;
  description: string;  // raw description / snippet
  sourceWeight: number; // from source config
}

const parser = new Parser({
  timeout: 10_000,      // 10s timeout per feed
  headers: {
    "User-Agent": "NewsBriefBot/1.0 (Personal news agent)",
    Accept: "application/rss+xml, application/xml, text/xml",
  },
});

function hashUrl(url: string): string {
  // Simple hash for dedup ID – good enough for daily use
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32-bit int
  }
  return Math.abs(hash).toString(36);
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchSingleFeed(source: RssSource): Promise<Article[]> {
  try {
    const feed = await parser.parseURL(source.url);
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 36 * 60 * 60 * 1000); // 36h lookback

    return (feed.items || [])
      .filter((item) => {
        if (!item.title || !item.link) return false;
        const pubDate = item.pubDate ? new Date(item.pubDate) : now;
        return pubDate >= oneDayAgo;
      })
      .map((item) => {
        const link = item.link!.trim();
        return {
          id: hashUrl(link),
          title: stripHtml(item.title || ""),
          link,
          source: source.name,
          sourceDomain: extractDomain(link),
          category: source.category,
          pubDate: item.pubDate ? new Date(item.pubDate) : now,
          description: stripHtml(
            item.contentSnippet || item.content || item.summary || item.title || ""
          ).slice(0, 1000), // cap description length
          sourceWeight: source.weight,
        };
      });
  } catch (err) {
    console.warn(`[RSS] Failed to fetch "${source.name}" (${source.url}):`, (err as Error).message);
    return [];
  }
}

/**
 * Fetch all configured RSS feeds in parallel.
 * Failed feeds are silently skipped with a console warning.
 */
export async function fetchAllFeeds(): Promise<Article[]> {
  console.log(`[RSS] Fetching ${RSS_SOURCES.length} feeds in parallel…`);
  const results = await Promise.allSettled(
    RSS_SOURCES.map((source) => fetchSingleFeed(source))
  );

  const articles: Article[] = [];
  let successCount = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      articles.push(...result.value);
      if (result.value.length > 0) successCount++;
    }
  }

  console.log(`[RSS] Fetched ${articles.length} articles from ${successCount}/${RSS_SOURCES.length} feeds`);
  return articles;
}
