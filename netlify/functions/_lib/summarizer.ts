// OpenRouter / Llama summarization module — BATCHED (single API call for all articles)
import type { ScoredArticle } from "./scorer.js";

export interface ArticleSummary {
  headline: string;
  bullets: string[];
  insight: string;
  source_url: string;
  source_name: string;
}

const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL =
  process.env.OPENROUTER_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free";

const SYSTEM_PROMPT = `You are a concise news summarizer for a personal daily briefing app focused on Agriculture, Artificial Intelligence, and Indian Business news.
You will receive multiple articles and must return a JSON array summarizing all of them.
Return ONLY a valid JSON array — no markdown fences, no explanation, no preamble.`;

function buildBatchPrompt(articles: ScoredArticle[]): string {
  const articleList = articles
    .map(
      (a, i) => `--- ARTICLE ${i + 1} ---
Title: ${a.title}
Source: ${a.source}
URL: ${a.link}
Content: ${(a.description || "").slice(0, 500)}`
    )
    .join("\n\n");

  return `Summarize each of the following ${articles.length} news articles.

${articleList}

Return ONLY a JSON array with exactly ${articles.length} objects in the same order, each with this structure:
[
  {
    "headline": "One crisp sentence summarizing the article in present tense (max 15 words)",
    "bullets": [
      "Key fact or development #1 with specific data if available",
      "Key fact or development #2",
      "Key fact or development #3"
    ],
    "insight": "One actionable sentence on the implication for Indian business/agriculture/AI (max 20 words)",
    "source_url": "exact URL from the article",
    "source_name": "exact source name from the article"
  }
]

Rules:
- Output ONLY the JSON array. No markdown, no backticks, no explanation.
- Each bullets array must have 2-3 items, max 20 words each.
- Use Indian context (₹ for rupees, crore/lakh units).
- Do NOT hallucinate facts not present in the articles.`;
}

/**
 * Extract JSON array from LLM response, handling markdown fences and leading text.
 */
function extractJsonArray(text: string): ArticleSummary[] {
  // Strip markdown code fences if present
  let cleaned = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  // Find the first '[' and last ']'
  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");
  if (start === -1 || end === -1) {
    throw new Error("No JSON array found in response");
  }

  const jsonStr = cleaned.slice(start, end + 1);
  return JSON.parse(jsonStr) as ArticleSummary[];
}

/**
 * Create a fallback summary from raw article data (no LLM needed).
 */
function fallbackSummary(article: ScoredArticle): ArticleSummary {
  return {
    headline: article.title,
    bullets: [
      (article.description || "See source for details.").slice(0, 150),
    ],
    insight: "Read the full article for more context.",
    source_url: article.link,
    source_name: article.source,
  };
}

/**
 * Summarize all selected articles in a single batched LLM call.
 * Falls back gracefully per-article if the LLM fails or returns bad JSON.
 */
export async function summarizeArticles(
  articles: ScoredArticle[]
): Promise<ArticleSummary[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  console.log(
    `[Summarizer] Batching ${articles.length} articles into 1 API call with ${MODEL}…`
  );

  const maxRetries = 3;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://news-intel-agent-kumar.netlify.app",
          "X-Title": "News Intelligence Agent",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildBatchPrompt(articles) },
          ],
          temperature: 0.2,
          max_tokens: 2500,
          // NOTE: response_format NOT used — unsupported by free Venice provider
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        // Check for retry-after header
        const retryAfter = res.headers.get("Retry-After");
        const waitSec = retryAfter ? parseInt(retryAfter, 10) : 15;
        throw new Error(
          `HTTP ${res.status} (retry in ${waitSec}s): ${errText}`
        );
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from API");

      console.log(`[Summarizer] Received response (${content.length} chars), parsing JSON…`);

      const parsed = extractJsonArray(content);

      if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error("Parsed result is not a valid array");
      }

      // Merge back source fields and validate each summary
      const summaries: ArticleSummary[] = articles.map((article, i) => {
        const s = parsed[i];
        if (!s || !s.headline || !Array.isArray(s.bullets)) {
          console.warn(`[Summarizer] Bad entry for article ${i + 1}, using fallback`);
          return fallbackSummary(article);
        }
        return {
          headline: s.headline,
          bullets: s.bullets.slice(0, 3),
          insight: s.insight || "Read the full article for more context.",
          source_url: article.link, // always use original URL
          source_name: article.source,
        };
      });

      console.log(
        `[Summarizer] Done. ${summaries.length}/${articles.length} summaries generated (1 API call).`
      );
      return summaries;
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      console.warn(
        `[Summarizer] Attempt ${attempt}/${maxRetries} failed: ${(err as Error).message}`
      );

      if (!isLastAttempt) {
        // Progressive backoff: 5s, 15s
        const waitMs = attempt === 1 ? 5000 : 15000;
        console.log(`[Summarizer] Waiting ${waitMs / 1000}s before retry…`);
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }
  }

  // All retries failed — return fallback summaries for all articles
  console.warn(
    `[Summarizer] All retries failed. Returning fallback summaries for all ${articles.length} articles.`
  );
  return articles.map(fallbackSummary);
}
