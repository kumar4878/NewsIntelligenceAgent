import webpush from "web-push";
import { getStore } from "@netlify/blobs";

interface DailyBriefing {
  date: string;
  generatedAt: string;
  categories: {
    agriculture: any[];
    ai: any[];
    business: any[];
  };
  articleCount: number;
  status: "success" | "partial" | "error";
  error?: string;
}

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

export async function sendPushNotifications(briefing: DailyBriefing): Promise<void> {
  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || "mailto:kumar@example.com";

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn("[Notifier] VAPID keys missing in env. Skipping push notifications.");
    return;
  }

  // Configure web-push
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const subStore = getStore("push-subscriptions");
  const rawSubs = await subStore.get("subscriptions.json");
  if (!rawSubs) {
    console.log("[Notifier] No push subscriptions found in storage.");
    return;
  }

  let subscriptions: UserSubscription[] = [];
  try {
    subscriptions = JSON.parse(rawSubs) as UserSubscription[];
  } catch (err) {
    console.error("[Notifier] Error parsing subscriptions:", err);
    return;
  }

  if (subscriptions.length === 0) {
    console.log("[Notifier] Subscriptions list is empty.");
    return;
  }

  console.log(`[Notifier] Found ${subscriptions.length} subscription(s). Sending notifications...`);

  const agriCount = briefing.categories.agriculture?.length || 0;
  const aiCount = briefing.categories.ai?.length || 0;
  const bizCount = briefing.categories.business?.length || 0;

  const expiredEndpoints = new Set<string>();

  const sendPromises = subscriptions.map(async (sub) => {
    const countsList: string[] = [];
    
    // Build personalized counts based on subscriber category preferences
    if (sub.preferences.showAgri && agriCount > 0) {
      countsList.push(`🌾 ${agriCount} Agri`);
    }
    if (sub.preferences.showAi && aiCount > 0) {
      countsList.push(`🤖 ${aiCount} AI`);
    }
    if (sub.preferences.showBiz && bizCount > 0) {
      countsList.push(`📈 ${bizCount} Biz`);
    }

    // If there are no new articles in any of their preferred categories, skip
    if (countsList.length === 0) {
      console.log(`[Notifier] Skipping endpoint ${sub.subscription.endpoint.slice(0, 30)}... (no preferred category updates)`);
      return;
    }

    const payload = JSON.stringify({
      title: "NewsBrief: Today's Briefing is Ready",
      body: `${countsList.join(" • ")} articles curated for you.`,
      data: { url: "/?tab=today" }
    });

    try {
      await webpush.sendNotification(sub.subscription, payload);
      console.log(`[Notifier] Notification sent to endpoint: ${sub.subscription.endpoint.slice(0, 45)}...`);
    } catch (err: any) {
      console.error(`[Notifier] Failed for endpoint: ${sub.subscription.endpoint.slice(0, 45)}... Error:`, err.message);
      // Clean up invalid or expired subscriptions (410 Gone / 404 Not Found)
      if (err.statusCode === 410 || err.statusCode === 404) {
        expiredEndpoints.add(sub.subscription.endpoint);
      }
    }
  });

  await Promise.all(sendPromises);

  // Clean up expired subscriptions
  if (expiredEndpoints.size > 0) {
    const activeSubs = subscriptions.filter((sub) => !expiredEndpoints.has(sub.subscription.endpoint));
    console.log(`[Notifier] Cleaning up ${expiredEndpoints.size} expired subscription(s).`);
    await subStore.set("subscriptions.json", JSON.stringify(activeSubs));
  }
}
