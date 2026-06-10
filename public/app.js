/* ═══════════════════════════════════════════════════════════════════════════
   NewsBrief – app.js  (Enterprise UI Edition)
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '/.netlify/functions';
const STORAGE_KEY = 'news-brief-settings';
const VAPID_PUBLIC_KEY = 'BOMmYn5aqBD6gWSiZ_HVRCnHG9FRYbYtRtSTuVe0dcECAd0RmbapMqTTBmzWwOd2mT8cv5ITMgwkO_jxwIugx08';
const CATEGORY_META = {
  agriculture: { label: 'Agriculture',           icon: '🌾', cls: 'agri', id: 'section-agriculture' },
  ai:          { label: 'Artificial Intelligence', icon: '🤖', cls: 'ai',   id: 'section-ai' },
  business:    { label: 'Indian Business',         icon: '📈', cls: 'biz',   id: 'section-business' },
};

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  currentTab:     'today',
  briefing:       null,
  bookmarks:      [],
  activeFilter:   'all',   // 'all' | 'agriculture' | 'ai' | 'business'
  searchQuery:    '',
  settings: {
    showAgri:       true,
    showAi:         true,
    showBiz:        true,
    compactMode:    false,
    pipelineTimeIST: '06:30',
  },
};

// ── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Utilities ────────────────────────────────────────────────────────────────
function formatDateIST(isoString) {
  const d = new Date(isoString || Date.now());
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

function formatFullDate(isoString) {
  const d = new Date(isoString || Date.now());
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatShortDate(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day:   d.toLocaleDateString('en-IN', { day: 'numeric' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
    full:  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function formatTime(isoString) {
  const d = new Date(isoString);
  return d.toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Banner / Toast ────────────────────────────────────────────────────────────
let bannerTimer = null;
function showBanner(type, text, autoDismiss = 4000) {
  const banner = $('status-banner');
  const icons  = { success: '✅', error: '❌', info: 'ℹ️', warning: '⚠️' };
  banner.className = `status-banner ${type}`;
  $('status-icon').textContent = icons[type] || 'ℹ️';
  $('status-text').textContent = text;
  if (bannerTimer) clearTimeout(bannerTimer);
  if (autoDismiss) bannerTimer = setTimeout(hideBanner, autoDismiss);
}

function hideBanner() {
  $('status-banner').className = 'status-banner hidden';
}

$('banner-close').addEventListener('click', hideBanner);

// ── Service Worker ────────────────────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then((reg) => {
        reg.addEventListener('updatefound', () => {
          const w = reg.installing;
          w.addEventListener('statechange', () => {
            if (w.state === 'installed' && navigator.serviceWorker.controller) {
              showBanner('info', 'App updated! Pull down to refresh.', 0);
            }
          });
        });
      })
      .catch((err) => console.warn('[SW] Registration failed:', err));
  });
}

// ── Tab Navigation ────────────────────────────────────────────────────────────
function switchTab(tabName) {
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
  const view = $(`tab-${tabName}`);
  const btn  = $(`nav-${tabName}`);
  if (view) view.classList.add('active');
  if (btn)  btn.classList.add('active');
  state.currentTab = tabName;
  if (tabName === 'history')   renderHistory();
  if (tabName === 'bookmarks') renderBookmarks();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab) switchTab(urlTab);

// ── Greeting ──────────────────────────────────────────────────────────────────
function setGreeting() {
  const h = parseInt(new Date().toLocaleTimeString('en-IN', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false,
  }), 10);
  const el = $('header-greeting');
  if (!el) return;
  if      (h < 12) el.textContent = '☀️ Good Morning, Kumar';
  else if (h < 17) el.textContent = '🌤️ Good Afternoon, Kumar';
  else             el.textContent = '🌙 Good Evening, Kumar';
}

// ── Date in header ────────────────────────────────────────────────────────────
function updateHeaderDate(isoString = null) {
  const el = $('header-date');
  if (!el) return;
  el.textContent = formatDateIST(isoString || new Date().toISOString());
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────
function updateStatsBar(briefing) {
  const bar = $('stats-bar');
  if (!bar) return;
  const { agriculture = [], ai = [], business = [] } = briefing.categories;
  $('count-agri').textContent = agriculture.length;
  $('count-ai').textContent   = ai.length;
  $('count-biz').textContent  = business.length;
  const genEl = $('stat-generated');
  if (genEl && briefing.generatedAt) {
    genEl.textContent = `Updated ${formatTime(briefing.generatedAt)}`;
  }
  bar.classList.remove('hidden');
}

// ── Search & Filter ───────────────────────────────────────────────────────────
function initSearchFilter() {
  const input = $('search-input');
  const clearBtn = $('search-clear');

  input.addEventListener('input', () => {
    state.searchQuery = input.value.trim().toLowerCase();
    clearBtn.classList.toggle('hidden', !input.value);
    applyFilters();
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    state.searchQuery = '';
    clearBtn.classList.add('hidden');
    applyFilters();
  });

  document.querySelectorAll('.filter-pill').forEach((pill) => {
    pill.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach((p) => p.classList.remove('active'));
      pill.classList.add('active');
      state.activeFilter = pill.dataset.filter;
      applyFilters();
    });
  });
}

function applyFilters() {
  if (!state.briefing) return;

  const query = state.searchQuery;
  const filter = state.activeFilter;
  let anyVisible = false;

  for (const [cat, meta] of Object.entries(CATEGORY_META)) {
    const section = $(meta.id);
    if (!section) continue;

    // Category visibility from settings
    const settingVisible = {
      agriculture: state.settings.showAgri,
      ai:          state.settings.showAi,
      business:    state.settings.showBiz,
    }[cat];

    // Active filter pill
    const filterMatch = filter === 'all' || filter === cat;

    if (!settingVisible || !filterMatch) {
      section.style.display = 'none';
      continue;
    }

    section.style.display = '';

    // Apply keyword search within visible cards
    const cards = section.querySelectorAll('.article-card');
    let sectionHasVisible = false;

    cards.forEach((card) => {
      const headline = card.querySelector('.article-headline');
      const headlineText = headline ? headline.textContent.toLowerCase() : '';
      const matches = !query || headlineText.includes(query);
      card.classList.toggle('dimmed', !matches);
      if (matches) sectionHasVisible = true;
    });

    if (sectionHasVisible) anyVisible = true;
  }

  // Show/hide no-results state
  const noResults = $('no-results');
  if (noResults) {
    noResults.style.display = (query && !anyVisible) ? '' : 'none';
  }
}

// ── Briefing Fetch & Render ───────────────────────────────────────────────────
async function fetchBriefing(date = null) {
  const url = date ? `${API_BASE}/briefing?date=${date}` : `${API_BASE}/briefing`;
  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function buildArticleCard(article, category, bookmarkedUrls) {
  const isBookmarked = bookmarkedUrls.has(article.source_url);
  const bullets = (article.bullets || []).slice(0, state.settings.compactMode ? 2 : 3);

  const bulletsHTML = bullets.map((b) =>
    `<li class="bullet-item"><span class="bullet-dot"></span><span>${escape(b)}</span></li>`
  ).join('');

  return `
    <div class="article-card" data-url="${escape(article.source_url)}">
      <button
        class="btn-bookmark${isBookmarked ? ' bookmarked' : ''}"
        aria-label="${isBookmarked ? 'Remove bookmark' : 'Save article'}"
        data-url="${escape(article.source_url)}"
        data-headline="${escape(article.headline)}"
        data-source="${escape(article.source_name || '')}"
        data-category="${escape(category)}"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="${isBookmarked ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
        </svg>
      </button>

      <p class="article-headline">${escape(article.headline)}</p>

      <ul class="article-bullets">${bulletsHTML}</ul>

      ${article.insight && !article.insight.includes('Read the full article') ? `
        <div class="insight-chip">
          <span>💡</span>
          <span>${escape(article.insight)}</span>
        </div>
      ` : ''}

      <div class="article-footer">
        <span class="source-badge">${escape(article.source_name || '')}</span>
        <div class="article-actions">
          <a href="${escape(article.source_url)}"
             target="_blank" rel="noopener noreferrer"
             class="btn-source"
             aria-label="Read full article">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Read
          </a>
        </div>
      </div>
    </div>
  `;
}

function buildCategorySection(category, articles, bookmarkedUrls) {
  const meta = CATEGORY_META[category];
  if (!articles || articles.length === 0) {
    return `
      <div class="category-header">
        <div class="category-icon">${meta.icon}</div>
        <span class="category-title">${meta.label}</span>
        <span class="category-count">0</span>
      </div>
      <div class="category-articles" style="max-height:0;opacity:0;"></div>
    `;
  }

  const cardsHTML = articles.map((a) => buildArticleCard(a, category, bookmarkedUrls)).join('');
  const totalH = articles.length * 260;

  return `
    <div class="category-header" role="button" tabindex="0" aria-expanded="true">
      <div class="category-icon">${meta.icon}</div>
      <span class="category-title">${meta.label}</span>
      <span class="category-count">${articles.length}</span>
      <svg class="category-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </div>
    <div class="category-articles" style="max-height:${totalH}px;">
      ${cardsHTML}
    </div>
  `;
}

function renderBriefingContent(briefing) {
  const bookmarkedUrls = new Set(state.bookmarks.map((b) => b.url));
  let anyVisible = false;

  for (const [cat, meta] of Object.entries(CATEGORY_META)) {
    const section = $(meta.id);
    if (!section) continue;

    const articles = briefing.categories[cat] || [];
    section.innerHTML = buildCategorySection(cat, articles, bookmarkedUrls);

    if (articles.length > 0) anyVisible = true;

    // Collapse/expand toggle
    const header = section.querySelector('.category-header');
    if (header) {
      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
        header.setAttribute('aria-expanded', !section.classList.contains('collapsed'));
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
      });
    }
  }

  // Attach bookmark listeners
  document.querySelectorAll('.btn-bookmark').forEach((btn) => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); toggleBookmark(btn); });
  });

  $('briefing-content').style.display = '';
  $('skeleton-loader').style.display  = 'none';
  $('stats-bar').classList.remove('hidden');
  $('search-filter-bar').classList.remove('hidden');
  $('no-results').style.display       = 'none';
  $('empty-today').style.display      = anyVisible ? 'none' : '';

  // Update stats
  updateStatsBar(briefing);

  // Apply any active filter/search
  applyFilters();
}

async function loadTodayBriefing(silent = false) {
  if (!silent) {
    $('skeleton-loader').style.display  = '';
    $('briefing-content').style.display = 'none';
    $('stats-bar').classList.add('hidden');
    $('search-filter-bar').classList.add('hidden');
    $('empty-today').style.display      = 'none';
    $('no-results').style.display       = 'none';
    hideBanner();
  }

  $('btn-refresh').classList.add('spinning');

  try {
    const briefing = await fetchBriefing();
    state.briefing = briefing;
    updateHeaderDate(briefing.generatedAt);
    renderBriefingContent(briefing);

    if (briefing.status === 'error') {
      showBanner('error', `Pipeline error: ${briefing.error || 'Unknown'}`, 8000);
    } else if (briefing.articleCount === 0) {
      showBanner('info', "Today's briefing is empty. Pipeline may still be running.", 6000);
    } else if (!silent) {
      showBanner('success', `Briefing ready — ${briefing.articleCount} articles`, 3000);
    }

    // Update last-run label in settings
    const lastRunEl = $('last-run-label');
    if (lastRunEl && briefing.generatedAt) {
      lastRunEl.textContent = `Last run: ${formatTime(briefing.generatedAt)} IST`;
    }

  } catch (err) {
    console.error('[App] Failed to load briefing:', err);
    $('skeleton-loader').style.display  = 'none';
    $('briefing-content').style.display = 'none';
    $('stats-bar').classList.add('hidden');
    $('search-filter-bar').classList.add('hidden');
    $('empty-today').style.display      = '';

    if (err.message.includes('No briefing')) {
      showBanner('info', "Today's briefing isn't ready yet.", 0);
    } else {
      showBanner('error', `Could not load briefing: ${err.message}`, 0);
    }
  } finally {
    $('btn-refresh').classList.remove('spinning');
  }
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────
async function loadBookmarks() {
  try {
    const res = await fetch(`${API_BASE}/bookmarks`);
    if (res.ok) state.bookmarks = await res.json();
  } catch { /* offline */ }
}

async function toggleBookmark(btn) {
  const url      = btn.dataset.url;
  const headline = btn.dataset.headline;
  const source   = btn.dataset.source;
  const category = btn.dataset.category;
  const isMarked = btn.classList.contains('bookmarked');

  // Optimistic update
  btn.classList.toggle('bookmarked');
  const svg = btn.querySelector('svg');
  if (svg) svg.setAttribute('fill', isMarked ? 'none' : 'currentColor');

  try {
    if (isMarked) {
      await fetch(`${API_BASE}/bookmarks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      state.bookmarks = state.bookmarks.filter((b) => b.url !== url);
      showBanner('info', 'Bookmark removed', 2000);
    } else {
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, headline, source_name: source, category }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.bookmark) state.bookmarks.unshift(data.bookmark);
        showBanner('success', 'Article saved!', 2000);
      }
    }
  } catch {
    // Revert
    btn.classList.toggle('bookmarked');
    showBanner('error', 'Could not update bookmark. Check your connection.', 3000);
  }
}

function renderBookmarks() {
  const list = $('bookmarks-list');
  if (!list) return;

  // Update count label
  const countLabel = $('bookmark-count-label');
  if (countLabel) {
    countLabel.textContent = state.bookmarks.length > 0
      ? `${state.bookmarks.length} article${state.bookmarks.length > 1 ? 's' : ''}`
      : '';
  }

  if (state.bookmarks.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-illustration">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#c7d2fe" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/>
          </svg>
        </div>
        <h3>No Bookmarks Yet</h3>
        <p>Tap the bookmark icon on any article to save it here.</p>
      </div>`;
    return;
  }

  const catIcons = { agriculture: '🌾', ai: '🤖', business: '📈' };

  list.innerHTML = state.bookmarks.map((bm) => {
    const catCls   = bm.category === 'agriculture' ? 'agri' : bm.category === 'ai' ? 'ai' : 'biz';
    const catLabel = CATEGORY_META[bm.category]?.label || bm.category;
    const catIcon  = catIcons[bm.category] || '';
    const savedDate = bm.savedAt
      ? new Date(bm.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '';
    const canShare = !!navigator.share;

    return `
      <div class="bookmark-card">
        <div class="bookmark-cat-badge ${catCls}">${catIcon} ${catLabel}</div>
        <p class="bookmark-headline">${escape(bm.headline)}</p>
        <div class="bookmark-meta">
          <span class="bookmark-source">${escape(bm.source_name || catLabel)}</span>
          <span class="bookmark-date">${savedDate}</span>
        </div>
        <div class="bookmark-actions">
          <a href="${escape(bm.url)}" target="_blank" rel="noopener noreferrer" class="btn-open-bookmark">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Read
          </a>
          ${canShare ? `
            <button class="btn-share-bookmark" data-url="${escape(bm.url)}" data-headline="${escape(bm.headline)}">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
              </svg>
              Share
            </button>
          ` : ''}
          <button class="btn-remove-bookmark" data-url="${escape(bm.url)}">Remove</button>
        </div>
      </div>
    `;
  }).join('');

  // Share listeners
  list.querySelectorAll('.btn-share-bookmark').forEach((btn) => {
    btn.addEventListener('click', async () => {
      try {
        await navigator.share({ title: btn.dataset.headline, url: btn.dataset.url });
      } catch { /* user cancelled or not supported */ }
    });
  });

  // Remove listeners
  list.querySelectorAll('.btn-remove-bookmark').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.url;
      try {
        await fetch(`${API_BASE}/bookmarks`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        state.bookmarks = state.bookmarks.filter((b) => b.url !== url);
        renderBookmarks();
        showBanner('info', 'Bookmark removed', 2000);
      } catch {
        showBanner('error', 'Failed to remove bookmark', 2000);
      }
    });
  });
}

// ── History Tab ───────────────────────────────────────────────────────────────
async function renderHistory() {
  const grid = $('history-grid');
  if (!grid) return;

  const today = getTodayIST();
  const dates = [];
  const now = new Date();

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    dates.push(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }));
  }

  grid.innerHTML = dates.map((dateStr) => {
    const { day, month, full } = formatShortDate(dateStr);
    const isToday = dateStr === today;
    return `
      <div class="history-card${isToday ? ' today' : ''}" data-date="${dateStr}" role="button" tabindex="0" aria-label="Briefing for ${full}">
        <div class="history-date-block">
          <span class="history-day">${day}</span>
          <span class="history-month">${month}</span>
        </div>
        <div class="history-info">
          <div class="history-label">${isToday ? "Today's Brief" : full}</div>
          <div class="history-meta">
            <span class="history-status pending" id="hist-status-${dateStr}">⏳ Loading</span>
          </div>
        </div>
        <svg class="history-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `;
  }).join('');

  // Eagerly fetch status for each date
  dates.forEach(async (dateStr) => {
    const statusEl = $(`hist-status-${dateStr}`);
    if (!statusEl) return;
    try {
      const briefing = await fetchBriefing(dateStr);
      const count = briefing.articleCount || 0;
      if (briefing.status === 'error') {
        statusEl.className = 'history-status error';
        statusEl.textContent = '⚠️ Error';
      } else {
        statusEl.className = 'history-status ready';
        statusEl.textContent = `✅ ${count} articles`;
      }
    } catch {
      statusEl.className = 'history-status error';
      statusEl.textContent = '— Not available';
    }
  });

  // Click to view
  grid.querySelectorAll('.history-card').forEach((card) => {
    const handler = async () => {
      const date = card.dataset.date;
      switchTab('today');
      updateHeaderDate(date + 'T00:00:00');
      $('skeleton-loader').style.display  = '';
      $('briefing-content').style.display = 'none';
      $('stats-bar').classList.add('hidden');
      $('search-filter-bar').classList.add('hidden');
      $('empty-today').style.display      = 'none';
      $('btn-refresh').classList.add('spinning');

      try {
        const briefing = await fetchBriefing(date);
        state.briefing = briefing;
        renderBriefingContent(briefing);
      } catch {
        $('skeleton-loader').style.display = 'none';
        $('empty-today').style.display     = '';
        showBanner('error', `No briefing found for ${date}`, 4000);
      } finally {
        $('btn-refresh').classList.remove('spinning');
      }
    };
    card.addEventListener('click', handler);
    card.addEventListener('keydown', (e) => { if (e.key === 'Enter') handler(); });
  });
}

// ── Settings ──────────────────────────────────────────────────────────────────
function istToUtcCron(istTime) {
  // Convert IST HH:MM to UTC cron (IST = UTC+5:30)
  const [h, m] = istTime.split(':').map(Number);
  const totalMins = h * 60 + m - 330; // subtract 5h30m
  const utcMins  = ((totalMins % 1440) + 1440) % 1440;
  const utcH = Math.floor(utcMins / 60);
  const utcM = utcMins % 60;
  return `${utcM} ${utcH} * * *`;
}

function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    Object.assign(state.settings, saved);
  } catch { /* use defaults */ }
}

function saveSettings() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.settings));
}

function applySettingsToUI() {
  const map = [
    ['toggle-agri',    'showAgri'],
    ['toggle-ai',      'showAi'],
    ['toggle-biz',     'showBiz'],
    ['toggle-compact', 'compactMode'],
  ];
  map.forEach(([id, key]) => {
    const el = $(id);
    if (el) el.checked = !!state.settings[key];
  });

  // Pipeline time
  const timeInput = $('pipeline-time-input');
  if (timeInput) {
    timeInput.value = state.settings.pipelineTimeIST || '06:30';
    updateCronPreview(timeInput.value);
  }

  // Next run label in empty state
  const nextRunEl = $('next-run-time');
  if (nextRunEl) {
    nextRunEl.textContent = `${state.settings.pipelineTimeIST || '06:30'} IST`;
  }
}

function updateCronPreview(istTime) {
  const cron = istToUtcCron(istTime);
  const cronEl = $('cron-preview');
  if (cronEl) cronEl.textContent = cron;
}

// ── Push Notification Helpers ─────────────────────────────────────────────────
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

async function getPushSubscription() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function updatePushStatusUI() {
  const toggle = $('toggle-push');
  const label = $('push-status-label');
  if (!toggle || !label) return;

  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    toggle.disabled = true;
    label.textContent = 'Unsupported by browser';
    return;
  }

  if (Notification.permission === 'denied') {
    toggle.checked = false;
    toggle.disabled = true;
    label.textContent = 'Blocked by browser permissions';
    return;
  }

  try {
    const sub = await getPushSubscription();
    if (sub) {
      toggle.checked = true;
      label.textContent = 'Active (Alerts enabled)';
    } else {
      toggle.checked = false;
      label.textContent = 'Receive alerts when daily briefing is ready';
    }
  } catch (err) {
    console.error('[Push] Error checking subscription:', err);
    label.textContent = 'Error checking status';
  }
}

async function subscribeUser() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      showBanner('error', 'Notification permission denied.', 3000);
      updatePushStatusUI();
      return;
    }

    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    });

    const res = await fetch(`${API_BASE}/push-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub,
        preferences: {
          showAgri: state.settings.showAgri,
          showAi: state.settings.showAi,
          showBiz: state.settings.showBiz
        }
      })
    });

    if (res.ok) {
      showBanner('success', 'Notifications enabled!', 3000);
    } else {
      throw new Error(`Server returned ${res.status}`);
    }
  } catch (err) {
    console.error('[Push] Subscription failed:', err);
    showBanner('error', 'Could not enable push notifications.', 4000);
  } finally {
    updatePushStatusUI();
  }
}

async function unsubscribeUser() {
  try {
    const sub = await getPushSubscription();
    if (sub) {
      await fetch(`${API_BASE}/push-subscription`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint: sub.endpoint })
      });
      await sub.unsubscribe();
      showBanner('info', 'Notifications disabled.', 3000);
    }
  } catch (err) {
    console.error('[Push] Unsubscribe failed:', err);
    showBanner('error', 'Error disabling notifications.', 3000);
  } finally {
    updatePushStatusUI();
  }
}

async function syncPushPreferences() {
  try {
    const sub = await getPushSubscription();
    if (!sub) return;

    await fetch(`${API_BASE}/push-subscription`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub,
        preferences: {
          showAgri: state.settings.showAgri,
          showAi: state.settings.showAi,
          showBiz: state.settings.showBiz
        }
      })
    });
  } catch (err) {
    console.warn('[Push] Failed to sync preferences with server:', err);
  }
}

function initSettings() {
  loadSettings();
  applySettingsToUI();

  // Category + compact toggles
  [
    ['toggle-agri',    'showAgri'],
    ['toggle-ai',      'showAi'],
    ['toggle-biz',     'showBiz'],
    ['toggle-compact', 'compactMode'],
  ].forEach(([id, key]) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener('change', () => {
      state.settings[key] = el.checked;
      saveSettings();
      if (state.briefing) renderBriefingContent(state.briefing);
      // Sync push notifications if categories change
      if (key !== 'compactMode') {
        syncPushPreferences();
      }
    });
  });

  // Push notification toggle
  const pushToggle = $('toggle-push');
  if (pushToggle) {
    pushToggle.addEventListener('change', () => {
      if (pushToggle.checked) {
        subscribeUser();
      } else {
        unsubscribeUser();
      }
    });
  }
  updatePushStatusUI();

  // Pipeline time input → live cron preview
  const timeInput = $('pipeline-time-input');
  if (timeInput) {
    timeInput.addEventListener('input', () => updateCronPreview(timeInput.value));
  }

  // Save schedule button
  const saveSchedBtn = $('btn-save-schedule');
  if (saveSchedBtn) {
    saveSchedBtn.addEventListener('click', () => {
      const t = timeInput ? timeInput.value : '06:30';
      state.settings.pipelineTimeIST = t;
      saveSettings();

      // Update empty state label
      const nextRunEl = $('next-run-time');
      if (nextRunEl) nextRunEl.textContent = `${t} IST`;

      showBanner('success', `Preferred time saved: ${t} IST. Update netlify.toml to apply server-side.`, 5000);
    });
  }

  // Copy cron button
  const copyBtn = $('btn-copy-cron');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      const cron = $('cron-preview')?.textContent || '';
      try {
        await navigator.clipboard.writeText(cron);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg> Copied!`;
        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg> Copy`;
        }, 2500);
      } catch {
        showBanner('error', 'Could not copy — please copy manually', 3000);
      }
    });
  }

  // Run pipeline now (settings page)
  const runBtn = $('btn-run-pipeline');
  if (runBtn) runBtn.addEventListener('click', () => triggerPipeline(runBtn));

  // Run pipeline now (empty state)
  const runBtnEmpty = $('btn-run-now-empty');
  if (runBtnEmpty) runBtnEmpty.addEventListener('click', () => triggerPipeline(runBtnEmpty));
}

async function triggerPipeline(btn) {
  const originalHTML = btn.innerHTML;
  btn.classList.add('loading');
  btn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="animation:spin .6s linear infinite"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg> Running…';
  showBanner('info', 'Pipeline triggered! This takes ~30–60 seconds…', 0);

  try {
    const res = await fetch(`${API_BASE}/daily-pipeline-background`, { method: 'POST' });
    if (res.status === 202 || res.ok) {
      showBanner('success', 'Pipeline started! Check back in ~60 seconds.', 8000);
      // Auto-reload after 65s
      setTimeout(() => loadTodayBriefing(false), 65000);
    } else {
      showBanner('error', `Pipeline returned HTTP ${res.status}`, 5000);
    }
  } catch (err) {
    showBanner('error', `Failed to trigger pipeline: ${err.message}`, 5000);
  } finally {
    btn.classList.remove('loading');
    btn.innerHTML = originalHTML;
  }
}

// ── Refresh Button ────────────────────────────────────────────────────────────
$('btn-refresh').addEventListener('click', () => {
  if (state.currentTab !== 'today') switchTab('today');
  loadTodayBriefing(false);
});

// ── Pull-to-refresh ───────────────────────────────────────────────────────────
let ptStartY = 0;
let ptActive = false;

document.addEventListener('touchstart', (e) => {
  if (window.scrollY === 0 && state.currentTab === 'today') {
    ptStartY = e.touches[0].clientY;
    ptActive = true;
  }
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (!ptActive) return;
  const diff = e.touches[0].clientY - ptStartY;
  if (diff > 60) $('ptr-indicator').classList.add('visible');
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (!ptActive) return;
  ptActive = false;
  const diff = e.changedTouches[0].clientY - ptStartY;
  $('ptr-indicator').classList.remove('visible');
  if (diff > 80) loadTodayBriefing(false);
}, { passive: true });

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  setGreeting();
  updateHeaderDate();
  initSettings();
  initSearchFilter();
  await loadBookmarks();
  await loadTodayBriefing(true);
}

init();
