// POST   /api/push-subscription  → registers/updates a push subscription
// DELETE /api/push-subscription  → removes a push subscription
// GET    /api/push-subscription  → retrieves all subscriptions (for debugging/internal use)

import type { Handler, HandlerEvent } from "@netlify/functions";
import { getStore, connectLambda } from "@netlify/blobs";

interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

interface PushSubscription {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

interface UserSubscription {
  subscription: PushSubscription;
  preferences: {
    showAgri: boolean;
    showAi: boolean;
    showBiz: boolean;
  };
  updatedAt: string;
}

const BLOB_KEY = "subscriptions.json";

async function getSubscriptions(store: ReturnType<typeof getStore>): Promise<UserSubscription[]> {
  try {
    const raw = await store.get(BLOB_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserSubscription[];
  } catch {
    return [];
  }
}

export const handler: Handler = async (event: HandlerEvent) => {
  connectLambda(event as any);
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: corsHeaders, body: "" };
  }

  const store = getStore("push-subscriptions");

  // ── GET ──────────────────────────────────────────────────────────────────
  if (event.httpMethod === "GET") {
    try {
      const subscriptions = await getSubscriptions(store);
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify(subscriptions),
      };
    } catch (err) {
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to load subscriptions" }),
      };
    }
  }

  // ── POST ─────────────────────────────────────────────────────────────────
  if (event.httpMethod === "POST") {
    try {
      const body = JSON.parse(event.body || "{}") as {
        subscription?: PushSubscription;
        preferences?: { showAgri: boolean; showAi: boolean; showBiz: boolean };
      };

      if (!body.subscription || !body.subscription.endpoint) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "Invalid subscription details" }),
        };
      }

      const subscriptions = await getSubscriptions(store);
      const existingIdx = subscriptions.findIndex(
        (sub) => sub.subscription.endpoint === body.subscription!.endpoint
      );

      const defaultPrefs = { showAgri: true, showAi: true, showBiz: true };
      const newSub: UserSubscription = {
        subscription: body.subscription,
        preferences: body.preferences || defaultPrefs,
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx > -1) {
        subscriptions[existingIdx] = newSub;
      } else {
        subscriptions.push(newSub);
      }

      await store.set(BLOB_KEY, JSON.stringify(subscriptions));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: "Subscription saved", subscription: newSub }),
      };
    } catch (err) {
      console.error("[push-subscription] POST error:", err);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to save push subscription" }),
      };
    }
  }

  // ── DELETE ───────────────────────────────────────────────────────────────
  if (event.httpMethod === "DELETE") {
    try {
      const body = JSON.parse(event.body || "{}") as { endpoint?: string };
      if (!body.endpoint) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ error: "endpoint is required" }),
        };
      }

      const subscriptions = await getSubscriptions(store);
      const filtered = subscriptions.filter((sub) => sub.subscription.endpoint !== body.endpoint);
      await store.set(BLOB_KEY, JSON.stringify(filtered));

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, message: "Subscription removed" }),
      };
    } catch (err) {
      console.error("[push-subscription] DELETE error:", err);
      return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({ error: "Failed to delete subscription" }),
      };
    }
  }

  return {
    statusCode: 405,
    headers: corsHeaders,
    body: JSON.stringify({ error: "Method not allowed" }),
  };
};
