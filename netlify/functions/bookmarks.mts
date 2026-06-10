// GET  /api/bookmarks         → returns all bookmarks
// POST /api/bookmarks         → adds a bookmark { url, headline, source_name, date }
// DELETE /api/bookmarks       → body { url } removes a bookmark

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getStore, connectLambda } from "@netlify/blobs";

interface Bookmark {
  url: string;
  headline: string;
  source_name: string;
  category: string;
  savedAt: string; // ISO timestamp
}

const BLOB_KEY = "bookmarks.json";

async function getBookmarks(store: ReturnType<typeof getStore>): Promise<Bookmark[]> {
  try {
    const raw = await store.get(BLOB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Bookmark[];
  } catch {
    return [];
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  connectLambda(event);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  const store = getStore("bookmarks");

  // ── GET ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === "GET") {
    const bookmarks = await getBookmarks(store);
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(bookmarks),
    };
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}") as Partial<Bookmark>;
      if (!body.url || !body.headline) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "url and headline are required" }),
        };
      }

      const bookmarks = await getBookmarks(store);

      // Prevent duplicate bookmarks
      if (bookmarks.some((b) => b.url === body.url)) {
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ message: "Already bookmarked", bookmarks }),
        };
      }

      const newBookmark: Bookmark = {
        url: body.url,
        headline: body.headline,
        source_name: body.source_name || "",
        category: body.category || "",
        savedAt: new Date().toISOString(),
      };

      bookmarks.unshift(newBookmark); // newest first
      // Keep max 100 bookmarks
      const trimmed = bookmarks.slice(0, 100);
      await store.set(BLOB_KEY, JSON.stringify(trimmed));

      return {
        statusCode: 201,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Bookmarked", bookmark: newBookmark }),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to save bookmark" }),
      };
    }
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (event.httpMethod === "DELETE") {
    try {
      const body = JSON.parse(event.body || "{}") as { url?: string };
      if (!body.url) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "url is required" }),
        };
      }

      const bookmarks = await getBookmarks(store);
      const filtered = bookmarks.filter((b) => b.url !== body.url);
      await store.set(BLOB_KEY, JSON.stringify(filtered));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ message: "Bookmark removed" }),
      };
    } catch {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to remove bookmark" }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
