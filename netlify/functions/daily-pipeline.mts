// Daily pipeline – Netlify Scheduled Function
// Runs at 01:00 UTC (06:30 IST) every day
// Schedule is set in netlify.toml

import type { Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { fetchAllFeeds } from "./_lib/rss-fetcher.js";
import { deduplicateArticles } from "./_lib/deduplicator.js";
import { classifyArticles } from "./_lib/classifier.js";
import { scoreAndSelect } from "./_lib/scorer.js";
import { summarizeArticles, type ArticleSummary } from "./_lib/summarizer.js";
import type { Category } from "./_lib/sources.js";
import { sendPushNotifications } from "./_lib/notifier.js";

export interface DailyBriefing {
  date: string;                        // YYYY-MM-DD IST
  generatedAt: string;                 // ISO timestamp UTC
  categories: {
    agriculture: ArticleSummary[];
    ai: ArticleSummary[];
    business: ArticleSummary[];
  };
  articleCount: number;
  status: "success" | "partial" | "error";
  error?: string;
}

function getTodayIST(): string {
  return new Date()
    .toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }); // YYYY-MM-DD
}

export default async function handler(): Promise<Response> {
  const startTime = Date.now();
  const today = getTodayIST();
  console.log(`\n═══════════════════════════════════════`);
  console.log(`[Pipeline] Starting daily pipeline for ${today}`);
  console.log(`═══════════════════════════════════════`);

  const store = getStore("briefings");

  try {
    // ── Step 1: Fetch RSS feeds ──────────────────────────────────────────
    const rawArticles = await fetchAllFeeds();
    if (rawArticles.length === 0) {
      throw new Error("No articles fetched from any feed");
    }

    // ── Step 2: Deduplicate ───────────────────────────────────────────────
    const dedupedArticles = deduplicateArticles(rawArticles);

    // ── Step 3: Classify ─────────────────────────────────────────────────
    const classifiedArticles = classifyArticles(dedupedArticles);

    // ── Step 4: Score & select top N per category ────────────────────────
    const selectedArticles = scoreAndSelect(classifiedArticles);

    // ── Step 5: Summarize with LLM ───────────────────────────────────────
    const summaries = await summarizeArticles(selectedArticles);

    // ── Step 6: Group summaries by category ──────────────────────────────
    const grouped: Record<Category, ArticleSummary[]> = {
      agriculture: [],
      ai: [],
      business: [],
    };

    for (let i = 0; i < selectedArticles.length; i++) {
      const article = selectedArticles[i];
      const summary = summaries[i];
      if (summary) {
        grouped[article.category].push(summary);
      }
    }

    // ── Step 7: Assemble briefing ─────────────────────────────────────────
    const briefing: DailyBriefing = {
      date: today,
      generatedAt: new Date().toISOString(),
      categories: {
        agriculture: grouped.agriculture,
        ai: grouped.ai,
        business: grouped.business,
      },
      articleCount: summaries.length,
      status: summaries.length > 0 ? "success" : "partial",
    };

    // ── Step 8: Persist to Netlify Blobs ─────────────────────────────────
    const briefingJson = JSON.stringify(briefing);
    await store.set(`${today}.json`, briefingJson, {
      metadata: { date: today, articleCount: summaries.length },
    });
    await store.set("latest.json", briefingJson, {
      metadata: { date: today },
    });

    // ── Step 9: Send Push Notifications ──────────────────────────────────
    try {
      await sendPushNotifications(briefing);
    } catch (pushErr) {
      console.error("[Pipeline] Error sending push notifications:", pushErr);
    }

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`\n[Pipeline] ✅ Complete in ${elapsed}s`);
    console.log(`  Agriculture: ${briefing.categories.agriculture.length} articles`);
    console.log(`  AI:          ${briefing.categories.ai.length} articles`);
    console.log(`  Business:    ${briefing.categories.business.length} articles`);

    return new Response(JSON.stringify({ success: true, date: today, articleCount: summaries.length }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = (err as Error).message;
    console.error(`[Pipeline] ❌ Fatal error:`, message);

    // Store error briefing so the app can show a meaningful fallback
    const errorBriefing: DailyBriefing = {
      date: today,
      generatedAt: new Date().toISOString(),
      categories: { agriculture: [], ai: [], business: [] },
      articleCount: 0,
      status: "error",
      error: message,
    };
    try {
      await store.set("latest.json", JSON.stringify(errorBriefing));
    } catch {
      // swallow blob error
    }

    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

export const config: Config = {
  schedule: "0 1 * * *", // 01:00 UTC = 06:30 IST daily
};
