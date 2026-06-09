// Deduplication: normalize URLs + fuzzy title matching
import type { Article } from "./rss-fetcher.js";

/**
 * Normalize a URL for comparison – strips tracking params, trailing slashes, protocol
 */
function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    // Remove common tracking params
    const stripParams = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "ref", "source"];
    stripParams.forEach((p) => u.searchParams.delete(p));
    // Normalize
    return (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/+$/, "") + u.search).toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

/**
 * Simple Levenshtein distance (for short strings – titles)
 */
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;
  if (an === 0) return bn;
  if (bn === 0) return an;

  const matrix: number[][] = [];
  for (let i = 0; i <= an; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bn; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[an][bn];
}

/**
 * Check if two titles are similar enough to be considered duplicates.
 * Threshold: Levenshtein distance < 15% of average title length.
 */
function titlesSimilar(a: string, b: string): boolean {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return true;

  const avgLen = (al.length + bl.length) / 2;
  if (avgLen === 0) return true;

  const dist = levenshtein(al, bl);
  return dist / avgLen < 0.15;
}

/**
 * Deduplicate articles by URL normalization and fuzzy title matching.
 * When duplicates found, keep the one from the higher-weight source.
 */
export function deduplicateArticles(articles: Article[]): Article[] {
  const seenUrls = new Map<string, Article>();
  const unique: Article[] = [];

  for (const article of articles) {
    const normUrl = normalizeUrl(article.link);

    // Check URL match
    if (seenUrls.has(normUrl)) {
      const existing = seenUrls.get(normUrl)!;
      // Keep higher-weight source
      if (article.sourceWeight > existing.sourceWeight) {
        const idx = unique.indexOf(existing);
        if (idx !== -1) unique[idx] = article;
        seenUrls.set(normUrl, article);
      }
      continue;
    }

    // Check title similarity against recent articles
    let isDuplicate = false;
    for (const existing of unique) {
      if (titlesSimilar(article.title, existing.title)) {
        // Keep higher-weight source
        if (article.sourceWeight > existing.sourceWeight) {
          const idx = unique.indexOf(existing);
          if (idx !== -1) {
            unique[idx] = article;
            seenUrls.set(normalizeUrl(article.link), article);
          }
        }
        isDuplicate = true;
        break;
      }
    }

    if (!isDuplicate) {
      seenUrls.set(normUrl, article);
      unique.push(article);
    }
  }

  console.log(`[Dedup] ${articles.length} → ${unique.length} articles (${articles.length - unique.length} duplicates removed)`);
  return unique;
}
