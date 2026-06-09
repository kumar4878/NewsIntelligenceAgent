// OpenRouter / Llama summarization module
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

const SYSTEM_PROMPT = `You are a concise news summarizer for a personal daily briefing app focused on Agriculture, Artificial Intelligence, and Indian Business news. Your output must be valid JSON only — no markdown, no explanation, no preamble.`;

function buildUserPrompt(article: ScoredArticle): string {
  return `Summarize the following news article into a structured JSON object.

Article Title: ${article.title}
Source: ${article.source}
URL: ${article.link}
Content: ${article.description}

Return ONLY this JSON structure (no markdown, no extra text):
{
  "headline": "One crisp sentence summarizing the article in present tense (max 15 words)",
  "bullets": [
    "Key fact or development #1 with specific data if available",
    "Key fact or development #2",
    "Key fact or development #3 (omit if not enough content)"
  ],
  "insight": "One sentence on the business or agricultural implication of this news",
  "source_url": "${article.link}",
  "source_name": "${article.source}"
}

Rules:
- bullets array must have 2-3 items
- Each bullet max 20 words
- insight must be actionable and specific, max 20 words
- Use Indian context where relevant (₹ symbol for rupees, crore/lakh)
- Do NOT hallucinate facts not in the article`;
}

async function summarizeWithRetry(
  article: ScoredArticle,
  apiKey: string,
  maxRetries = 3
): Promise<ArticleSummary | null> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://news-intelligence-agent.netlify.app",
          "X-Title": "News Intelligence Agent",
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: buildUserPrompt(article) },
          ],
          temperature: 0.3,
          max_tokens: 400,
          response_format: { type: "json_object" },
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("Empty response from API");

      const parsed = JSON.parse(content) as ArticleSummary;

      // Validate required fields
      if (!parsed.headline || !Array.isArray(parsed.bullets) || !parsed.insight) {
        throw new Error("Invalid response structure");
      }

      // Ensure source fields
      parsed.source_url = parsed.source_url || article.link;
      parsed.source_name = parsed.source_name || article.source;

      return parsed;
    } catch (err) {
      const isLastAttempt = attempt === maxRetries;
      console.warn(
        `[Summarizer] Attempt ${attempt}/${maxRetries} failed for "${article.title}": ${(err as Error).message}`
      );
      if (!isLastAttempt) {
        // Exponential backoff: 2s, 4s, 8s
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
      }
    }
  }

  // Fallback: return basic summary from raw data
  console.warn(`[Summarizer] Using fallback summary for: ${article.title}`);
  return {
    headline: article.title,
    bullets: [article.description.slice(0, 150) || "See source for details."],
    insight: "Read the full article for more context.",
    source_url: article.link,
    source_name: article.source,
  };
}

/**
 * Summarize all selected articles using OpenRouter / Llama.
 * Processes sequentially to respect free-tier rate limits (~1 req/s safe).
 */
export async function summarizeArticles(
  articles: ScoredArticle[]
): Promise<ArticleSummary[]> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY environment variable is not set");
  }

  const summaries: ArticleSummary[] = [];
  console.log(`[Summarizer] Summarizing ${articles.length} articles with ${MODEL}…`);

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    console.log(`[Summarizer] ${i + 1}/${articles.length}: "${article.title}"`);
    const summary = await summarizeWithRetry(article, apiKey);
    if (summary) summaries.push(summary);

    // 1.2s delay between calls to respect free-tier rate limits
    if (i < articles.length - 1) {
      await new Promise((r) => setTimeout(r, 1200));
    }
  }

  console.log(`[Summarizer] Done. ${summaries.length}/${articles.length} summaries generated.`);
  return summaries;
}
