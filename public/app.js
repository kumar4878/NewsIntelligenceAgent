/* ═══════════════════════════════════════════════════════════════════════════
   News Intelligence Agent – app.js
   Main PWA application logic
   ═══════════════════════════════════════════════════════════════════════════ */

'use strict';

// ── Constants ────────────────────────────────────────────────────────────────
const API_BASE = '/.netlify/functions';
const CATEGORY_META = {
  agriculture: { label: 'Agriculture',          icon: '🌾', cls: 'agri', id: 'section-agriculture' },
  ai:          { label: 'Artificial Intelligence', icon: '🤖', cls: 'ai',   id: 'section-ai'          },
  business:    { label: 'Indian Business',       icon: '📈', cls: 'biz',   id: 'section-business'    },
};

// ── State ────────────────────────────────────────────────────────────────────
const state = {
  currentTab:    'today',
  briefing:      null,
  bookmarks:     [],
  settings: {
    showAgri:    true,
    showAi:      true,
    showBiz:     true,
    compactMode: false,
  },
};

// ── DOM refs ─────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatDateIST(isoString) {
  const d = new Date(isoString || Date.now());
  return d.toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata',
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function formatShortDate(dateStr) {
  // dateStr: YYYY-MM-DD
  const d = new Date(dateStr + 'T00:00:00');
  return {
    day:   d.toLocaleDateString('en-IN', { day: 'numeric' }),
    month: d.toLocaleDateString('en-IN', { month: 'short' }),
    full:  d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
  };
}

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // YYYY-MM-DD
}

function escape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showBanner(type, text, autoDismiss = 4000) {
  const banner = $('status-banner');
  const icons  = { success: '✅', error: '❌', info: 'ℹ️' };
  banner.className = `status-banner ${type}`;
  $('status-icon').textContent = icons[type] || 'ℹ️';
  $('status-text').textContent = text;
  if (autoDismiss) setTimeout(() => { banner.className = 'status-banner hidden'; }, autoDismiss);
}

function hideBanner() {
  $('status-banner').className = 'status-banner hidden';
}

// ── Service Worker registration ───────────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      console.log('[App] Service worker registered:', reg.scope);
      // Check for updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showBanner('info', 'App updated! Pull to refresh for latest version.', 0);
          }
        });
      });
    }).catch((err) => console.warn('[App] SW registration failed:', err));
  });
}

// ── Tab navigation ────────────────────────────────────────────────────────────
function switchTab(tabName) {
  // Hide all views
  document.querySelectorAll('.tab-view').forEach((v) => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));

  // Show selected
  const view = $(`tab-${tabName}`);
  const btn  = $(`nav-${tabName}`);
  if (view) view.classList.add('active');
  if (btn)  btn.classList.add('active');

  state.currentTab = tabName;

  // Lazy-load tab data
  if (tabName === 'history')   renderHistory();
  if (tabName === 'bookmarks') renderBookmarks();
}

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// Handle URL shortcut ?tab=
const urlTab = new URLSearchParams(location.search).get('tab');
if (urlTab) switchTab(urlTab);

// ── Briefing fetch & render ───────────────────────────────────────────────────
async function fetchBriefing(date = null) {
  const url = date
    ? `${API_BASE}/briefing?date=${date}`
    : `${API_BASE}/briefing`;

  const res = await fetch(url);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

function buildArticleCard(article, category, bookmarkedUrls) {
  const meta      = CATEGORY_META[category];
  const isBookmarked = bookmarkedUrls.has(article.source_url);
  const bullets   = (article.bullets || []).slice(0, state.settings.compactMode ? 2 : 3);

  const bulletsHTML = bullets.map((b) =>
    `<li class="bullet-item"><span class="bullet-dot"></span><span>${escape(b)}</span></li>`
  ).join('');

  return `
    <div class="article-card" data-url="${escape(article.source_url)}">
      <button
        class="btn-bookmark${isBookmarked ? ' bookmarked' : ''}"
        aria-label="${isBookmarked ? 'Remove bookmark' : 'Bookmark article'}"
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

      ${article.insight ? `
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
      <div class="category-articles" style="max-height:0;opacity:0;border:none;"></div>
    `;
  }

  const cardsHTML = articles.map((a) => buildArticleCard(a, category, bookmarkedUrls)).join('');
  const totalH    = articles.length * 220; // rough height for animation

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
  const { agriculture, ai, business } = briefing.categories;

  const visibilityMap = {
    agriculture: state.settings.showAgri,
    ai:          state.settings.showAi,
    business:    state.settings.showBiz,
  };

  let anyVisible = false;

  for (const [cat, meta] of Object.entries(CATEGORY_META)) {
    const section = $(meta.id);
    if (!section) continue;

    const articles = briefing.categories[cat] || [];
    const visible  = visibilityMap[cat];

    section.style.display = visible ? '' : 'none';
    if (visible && articles.length > 0) anyVisible = true;

    section.innerHTML = buildCategorySection(cat, articles, bookmarkedUrls);

    // Collapse toggle
    const header = section.querySelector('.category-header');
    if (header) {
      header.addEventListener('click', () => {
        section.classList.toggle('collapsed');
        const expanded = !section.classList.contains('collapsed');
        header.setAttribute('aria-expanded', expanded);
      });
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); header.click(); }
      });
    }
  }

  // Attach bookmark button listeners
  document.querySelectorAll('.btn-bookmark').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleBookmark(btn);
    });
  });

  // Show/hide empty state
  $('briefing-content').style.display = '';
  $('skeleton-loader').style.display  = 'none';
  $('empty-today').style.display      = anyVisible ? 'none' : '';
}

async function loadTodayBriefing(silent = false) {
  if (!silent) {
    $('skeleton-loader').style.display  = '';
    $('briefing-content').style.display = 'none';
    $('empty-today').style.display      = 'none';
    hideBanner();
  }

  // Spin the refresh button
  $('btn-refresh').classList.add('spinning');

  try {
    const briefing  = await fetchBriefing();
    state.briefing  = briefing;

    // Update header date
    $('header-date').textContent = formatDateIST(briefing.generatedAt);

    renderBriefingContent(briefing);

    if (briefing.status === 'error') {
      showBanner('error', `Pipeline error: ${briefing.error || 'Unknown error'}`, 8000);
    } else if (briefing.articleCount === 0) {
      showBanner('info', "Today's briefing is empty. Pipeline may still be running.", 6000);
    } else if (!silent) {
      showBanner('success', `Briefing ready — ${briefing.articleCount} articles`, 3000);
    }
  } catch (err) {
    console.error('[App] Failed to load briefing:', err);
    $('skeleton-loader').style.display  = 'none';
    $('briefing-content').style.display = 'none';
    $('empty-today').style.display      = '';

    if (err.message.includes('No briefing')) {
      showBanner('info', "Today's briefing isn't ready yet. Runs at 06:30 IST.", 0);
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
    if (res.ok) {
      state.bookmarks = await res.json();
    }
  } catch {
    // Offline – use cached state
  }
}

async function toggleBookmark(btn) {
  const url       = btn.dataset.url;
  const headline  = btn.dataset.headline;
  const source    = btn.dataset.source;
  const category  = btn.dataset.category;
  const isMarked  = btn.classList.contains('bookmarked');

  // Optimistic UI update
  btn.classList.toggle('bookmarked');
  const svgPath = btn.querySelector('svg');
  if (svgPath) svgPath.setAttribute('fill', isMarked ? 'none' : 'currentColor');

  try {
    if (isMarked) {
      // Remove
      await fetch(`${API_BASE}/bookmarks`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      state.bookmarks = state.bookmarks.filter((b) => b.url !== url);
      showBanner('info', 'Bookmark removed', 2000);
    } else {
      // Add
      const res = await fetch(`${API_BASE}/bookmarks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, headline, source_name: source, category }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.bookmark) state.bookmarks.unshift(data.bookmark);
        showBanner('success', 'Article saved to bookmarks', 2000);
      }
    }
  } catch {
    // Revert optimistic update on failure
    btn.classList.toggle('bookmarked');
    showBanner('error', 'Could not save bookmark. Check connection.', 3000);
  }
}

function renderBookmarks() {
  const list = $('bookmarks-list');
  if (!list) return;

  if (state.bookmarks.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔖</div>
        <h3>No Bookmarks Yet</h3>
        <p>Tap the ★ icon on any article to save it here.</p>
      </div>
    `;
    return;
  }

  list.innerHTML = state.bookmarks.map((bm) => {
    const catLabel = CATEGORY_META[bm.category]?.label || bm.category;
    const savedDate = bm.savedAt
      ? new Date(bm.savedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
      : '';

    return `
      <div class="bookmark-card">
        <p class="bookmark-headline">${escape(bm.headline)}</p>
        <div class="bookmark-meta">
          <span class="bookmark-source">${escape(bm.source_name || catLabel)}</span>
          <span class="bookmark-date">${escape(savedDate)}</span>
        </div>
        <div class="bookmark-actions">
          <a href="${escape(bm.url)}" target="_blank" rel="noopener noreferrer" class="btn-open-bookmark">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
            Read Article
          </a>
          <button class="btn-remove-bookmark" data-url="${escape(bm.url)}" aria-label="Remove bookmark">
            Remove
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Attach remove listeners
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

// ── History tab ───────────────────────────────────────────────────────────────
async function renderHistory() {
  const grid = $('history-grid');
  if (!grid) return;

  const today   = getTodayIST();
  const dates   = [];
  const now     = new Date();

  // Generate last 7 days (IST)
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
          <div class="history-meta">Tap to view</div>
        </div>
        <svg class="history-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </div>
    `;
  }).join('');

  grid.querySelectorAll('.history-card').forEach((card) => {
    const handler = async () => {
      const date = card.dataset.date;
      switchTab('today');

      $('header-date').textContent = formatShortDate(date).full;
      $('skeleton-loader').style.display  = '';
      $('briefing-content').style.display = 'none';
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
function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('news-brief-settings') || '{}');
    Object.assign(state.settings, saved);
  } catch { /* use defaults */ }
}

function saveSettings() {
  localStorage.setItem('news-brief-settings', JSON.stringify(state.settings));
}

function applySettingsToToggles() {
  const agri    = $('toggle-agri');
  const ai      = $('toggle-ai');
  const biz     = $('toggle-biz');
  const compact = $('toggle-compact');
  if (agri)    agri.checked    = state.settings.showAgri;
  if (ai)      ai.checked      = state.settings.showAi;
  if (biz)     biz.checked     = state.settings.showBiz;
  if (compact) compact.checked = state.settings.compactMode;
}

function initSettings() {
  loadSettings();
  applySettingsToToggles();

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
      // Re-render briefing to apply visibility
      if (state.briefing) renderBriefingContent(state.briefing);
    });
  });
}

// ── Refresh button ────────────────────────────────────────────────────────────
$('btn-refresh').addEventListener('click', () => {
  if (state.currentTab === 'today') {
    loadTodayBriefing(false);
  } else {
    switchTab('today');
    loadTodayBriefing(false);
  }
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
  if (diff > 60) {
    $('ptr-indicator').classList.add('visible');
  }
}, { passive: true });

document.addEventListener('touchend', (e) => {
  if (!ptActive) return;
  ptActive = false;
  const diff = e.changedTouches[0].clientY - ptStartY;
  $('ptr-indicator').classList.remove('visible');
  if (diff > 80) {
    loadTodayBriefing(false);
  }
}, { passive: true });

// ── Header date ───────────────────────────────────────────────────────────────
$('header-date').textContent = formatDateIST(new Date().toISOString());

// ── Greeting by time ──────────────────────────────────────────────────────────
function setGreeting() {
  const hour = new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false });
  const h    = parseInt(hour, 10);
  const greetingEl = document.querySelector('.header-greeting');
  if (!greetingEl) return;
  if (h < 12)      greetingEl.textContent = 'Good Morning, Kumar ☀️';
  else if (h < 17) greetingEl.textContent = 'Good Afternoon, Kumar 🌤️';
  else             greetingEl.textContent = 'Good Evening, Kumar 🌙';
}
setGreeting();

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  initSettings();
  await loadBookmarks();
  await loadTodayBriefing(true);
}

init();
