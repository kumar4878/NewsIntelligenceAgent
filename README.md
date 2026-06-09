# News Intelligence Agent 📰

A **Personal PWA** delivering a daily 5-minute news briefing on **Agriculture, AI & Indian Business** — hosted on Netlify, installable on your phone's home screen.

## How It Works

```
06:30 IST daily → Netlify Scheduled Function
  → Fetches 12 RSS feeds (PIB, ET, BusinessLine, Analytics India Magazine…)
  → Deduplicates + classifies + scores articles
  → Summarizes top 9 articles via OpenRouter (Llama 3.3 70B — free tier)
  → Stores briefing JSON in Netlify Blobs
  → PWA fetches & displays on your phone
```

## Stack

| Layer | Tech |
|---|---|
| Frontend | Vanilla HTML/CSS/JS PWA |
| Backend | Netlify Functions (Node.js 20, TypeScript) |
| Storage | Netlify Blobs |
| LLM | Llama 3.3 70B via OpenRouter (free) |
| Scheduling | Netlify Scheduled Functions (cron) |

## Local Development

### Prerequisites
- Node.js 20+
- [Netlify CLI](https://docs.netlify.com/cli/get-started/): `npm install -g netlify-cli`
- Free [OpenRouter API key](https://openrouter.ai)

### Setup

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your key
cp .env.example .env
# Edit .env → set OPENROUTER_API_KEY=sk-or-...

# 3. Start local dev server
npm run dev
# Opens at http://localhost:8888
```

### Manually trigger the pipeline

```bash
# Run the full pipeline locally (fetches feeds, summarizes, stores)
npm run invoke:pipeline
```

## Deploy to Netlify

```bash
# 1. Login to Netlify
netlify login

# 2. Create a new site
netlify init

# 3. Set the API key as an environment variable
netlify env:set OPENROUTER_API_KEY "sk-or-your-key-here"

# 4. Deploy
netlify deploy --prod
```

After deploy:
- Visit your Netlify URL in Chrome on your phone
- Tap **Share → Add to Home Screen**
- Done — you have a native-like news app!

## Project Structure

```
├── netlify.toml                  # Build config + cron schedule (06:30 IST)
├── package.json
├── public/                       # PWA frontend (static)
│   ├── index.html
│   ├── app.js
│   ├── styles.css
│   ├── manifest.json
│   ├── sw.js                     # Service worker (offline support)
│   └── icons/
└── netlify/functions/
    ├── daily-pipeline.mts        # Scheduled: full pipeline
    ├── briefing.mts              # GET /api/briefing
    ├── bookmarks.mts             # GET/POST/DELETE /api/bookmarks
    └── _lib/
        ├── sources.ts            # RSS feed list
        ├── rss-fetcher.ts        # Parallel feed fetching
        ├── deduplicator.ts       # URL + title dedup
        ├── classifier.ts         # Category tagging
        ├── scorer.ts             # Relevance scoring
        └── summarizer.ts         # OpenRouter/Llama API
```

## Tabs

| Tab | Description |
|---|---|
| **Today** | Today's briefing (Agriculture / AI / Business) |
| **History** | Last 7 days of briefings |
| **Saved** | Bookmarked articles |
| **Settings** | Toggle categories, compact mode |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `OPENROUTER_API_KEY` | ✅ | Get free key at [openrouter.ai](https://openrouter.ai) |
| `OPENROUTER_MODEL` | Optional | Default: `meta-llama/llama-3.3-70b-instruct:free` |

## Cost

**₹0/month** — Netlify free tier + OpenRouter free tier covers all personal use.
