// GET /api/briefing          → returns today's (latest) briefing
// GET /api/briefing?date=YYYY-MM-DD → returns briefing for specific date

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export const handler: Handler = async (event: HandlerEvent) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  }

  const store = getStore("briefings");
  const dateParam = event.queryStringParameters?.date;

  // Validate date param format
  if (dateParam && !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Invalid date format. Use YYYY-MM-DD" }),
    };
  }

  const blobKey = dateParam
    ? `briefings/${dateParam}.json`
    : "briefings/latest.json";

  try {
    const raw = await store.get(blobKey);
    if (!raw) {
      return {
        statusCode: 404,
        headers: corsHeaders,
        body: JSON.stringify({
          error: "No briefing found",
          message: dateParam
            ? `No briefing available for ${dateParam}`
            : "No briefing has been generated yet. The pipeline runs daily at 06:30 IST.",
        }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        "Cache-Control": "public, max-age=3600", // cache 1 hour
      },
      body: raw,
    };
  } catch (err) {
    console.error("[briefing] Error reading blob:", err);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: "Failed to retrieve briefing" }),
    };
  }
};
