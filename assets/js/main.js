// ===== HallieForAnimals — main.js =====

// update year in footer
const yearEl = document.getElementById('yr');
if (yearEl) yearEl.textContent = new Date().getFullYear();

// === Banner height → CSS var for sticky nav offset ===

// determine JSON path (now lives in /data/)
const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '/');
const jsonURL = new URL('data/links.json', location.origin + base).href;

// find where to render (our sections container)
const container = document.getElementById('sections') || document.getElementById('links');

function isActionCTA(item) {
  const t = (item.tag || '').toLowerCase();
  // treat known tags + anything that clearly has an action URL as an actionable CTA
  const known = ['email','petition','donate','call','appeal','action','cta'];
  if (known.includes(t)) return true;

  const url = item.url || item.urlIndex || '';
  if (!url) return false;

  // accept mailto, internal shortlinks (/s/slug), or any http(s)
  return /^mailto:/i.test(url) || /\/s\/[^/]+/i.test(url) || /^https?:\/\//i.test(url) || /^\//.test(url) || /^#/.test(url);
}


function getEmailFromForm(form) {
  const v =
    form.querySelector('input[type="email"]')?.value ??
    form.querySelector('input[name="email"]')?.value ??
    form.querySelector('#subscribe-email')?.value ?? '';
  return String(v).trim();
}
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

async function postToButtondown(email) {
  const ENDPOINT = 'https://buttondown.email/api/emails/embed-subscribe/hallieforanimals';
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email })
    });
    const html = await res.text(); // Buttondown returns HTML

    // crude message extraction from the first <p> tag, with sane fallbacks
    const msg = (() => {
      const cleaned = html.replace(/\n+/g, ' ');
      const m = cleaned.match(/<p[^>]*>(.*?)<\/p>/i);
      if (m && m[1]) return m[1].replace(/<[^>]+>/g, '').trim();
      if (/already/i.test(cleaned)) return 'You’re already on the list.';
      if (/confirm|check your inbox/i.test(cleaned)) return 'Check your inbox for a confirmation email.';
      if (/cannot|can\'t|can’t|suppressed|unsub/i.test(cleaned)) return 'This address can’t be subscribed right now.';
      return res.ok ? 'Subscribed.' : 'Subscribe failed.';
    })();

    return { ok: res.ok, status: res.status, msg };
  } catch (e) {
    return { ok: false, status: 0, msg: 'Network error. Please try again.' };
  }
}

// Generic JSON loader that tries common locations (root, /data, /assets/data)
async function fetchJSONcandidates(rel) {
  const base = location.pathname.endsWith('/')
    ? location.pathname
    : location.pathname.replace(/[^/]+$/, '/');

  const candidates = [
    // relative to current page
    new URL(rel, location.origin + base).href,
    new URL('data/' + rel, location.origin + base).href,
    new URL('assets/data/' + rel, location.origin + base).href,
    // site-root
    new URL('/' + rel, location.origin).href,
    new URL('/data/' + rel, location.origin).href,
    new URL('/assets/data/' + rel, location.origin).href
  ];

  for (const href of candidates) {
    try {
      const r = await fetch(href, { cache: 'no-store' });
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  throw new Error('Could not load ' + rel);
}


async function renderIndexEmailCTAs() {
  const grid = document.getElementById('cta-grid');
  if (!grid) return; // not on index
  try {
    const data = await fetchLinksJson();
    const items = flattenSections(data).filter(isEmailCTA);
    grid.innerHTML = items.map(i => `
      <a class="pill" href="${i.url}" target="_blank" rel="noopener">
        ${i.title}
      </a>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

// prefer explicit email-tagged CTAs
let candidates = recentLinks.filter(it => (it.tag || '').toLowerCase() === 'email');

// if none, accept anything that looks like a mailto or shortlink
if (!candidates.length) {
  candidates = recentLinks.filter(it => {
    const url = it.url || it.urlIndex || '';
    return /^mailto:/i.test(url) || /\/s\/[^/]+/i.test(url);
  });
}

// if still none, fall back to any actionable CTA
if (!candidates.length) {
  candidates = recentLinks.filter(isActionCTA);
}

// newest → oldest by optional date field
candidates.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));
if (!candidates.length) return;

const first = candidates[0];
text.textContent = first.title || 'Take Action';
link.href = (first.url || first.urlIndex || '#');
banner.hidden = false;



// fetch and render
fetch(jsonURL, { cache: 'no-store' })
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.text();
  })
  .then(txt => {
    const data = JSON.parse(txt.trim());
    if (!data || !Array.isArray(data.sections))
      throw new Error('Expected sections[] in links.json');

    const order = ['Recent Cases', 'Ongoing Cases'];
    const sections = [...data.sections].sort((a, b) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });

// detect which page we’re on
const onCTA = !!document.getElementById('cta-grid');
const onOngoing = !!document.getElementById('ongoing-sections');

// find sections once
const recentSec  = sections.find(s => /recent/i.test(s?.name || ''));
const ongoingSec = sections.find(s => /ongoing/i.test(s?.name || ''));

// sort by date (if present) newest→oldest
if (recentSec?.links)  recentSec.links.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));
if (ongoingSec?.links) ongoingSec.links.sort((a,b)=>new Date(b.date||0)-new Date(a.date||0));

if (onCTA) {
  // cta.html: ALL recent, in a 2-col grid
  updateBannerFromFirstEmail();


} else {
  // index.html → split: Recent (left) + Ongoing (right)
  const recent6 = recentSec ? { ...recentSec, links: (recentSec.links || []).slice(0, 6) } : null;

  // Clear any previous content and render the split columns
  if (container) {
    container.innerHTML = '';
    renderHomeSplitColumns(recent6, ongoingSec);
  }

  updateBannerFromFirstEmail();
}

  })


// build section + its buttons
function addSection(sec) {
  const wrap = document.createElement('section');
  wrap.className = 'section';

  const h2 = document.createElement('h2');
  h2.textContent = (sec.name || 'Untitled').toUpperCase();
  wrap.appendChild(h2);

  const stack = document.createElement('div');
  stack.className = 'stack';
  wrap.appendChild(stack);

  // Detect if we're on the homepage (index.html)
  const isIndexPage =
    /(?:^|\/)(index\.html)?$/.test(location.pathname) ||
    /\/site\/?$/.test(location.pathname);

  // Build ALL case buttons
  if (Array.isArray(sec.links)) {
    for (const it of sec.links) {
      const a = document.createElement('a');
      a.className = 'action-btn';

      // 🔗 Use urlIndex on the homepage, else normal url
      a.href = isIndexPage ? (it.urlIndex || it.url || '#') : (it.url || '#');

      // open in same tab for internal links, new tab for external
      if (!/^mailto:/i.test(a.href)) {
        const isInternal = a.href.startsWith(location.origin) || a.href.startsWith('/');
        if (isInternal) {
          a.removeAttribute('target');
          a.removeAttribute('rel');
        } else {
          a.target = '_blank';
          a.rel = 'noopener';
        }
      }

      a.innerHTML = `
        <div>${it.emoji ? `<span style="margin-right:8px">${it.emoji}</span>` : ''}${it.title || ''}</div>
        ${it.subtitle ? `<small class="action-meta">${it.subtitle}</small>` : ''}`;
      stack.appendChild(a);
    }
  }

  // mirrored footer bar per section
  if (/recent cases/i.test(sec.name || '')) {
    wrap.appendChild(makeMirrorFooter('/cta.html', 'SEE ALL RECENT CASES'));
  } else if (/ongoing cases/i.test(sec.name || '')) {
    wrap.appendChild(makeMirrorFooter('/ongoing.html', 'SEE ALL ONGOING CASES'));
  }

  container.appendChild(wrap);
}

function renderHomeSplitColumns(recentSec, ongoingSec) {
  if (!container) return;

  const isIndexPage = true; // we’re only called from index

  // Wrapper grid
  const split = document.createElement('div');
  split.id = 'home-split';
  split.className = 'home-split';

  // Column builder (mirrors addSection(), but no stacking one under another)
  function buildCol(sec, footerHref, footerLabel) {
    const wrap = document.createElement('section');
    wrap.className = 'section section-card';

    const h2 = document.createElement('h2');
    h2.textContent = (sec?.name || 'Untitled').toUpperCase();
    wrap.appendChild(h2);

    const stack = document.createElement('div');
    stack.className = 'stack';
    wrap.appendChild(stack);

    // buttons
    (sec?.links || []).forEach(it => {
      const a = document.createElement('a');
      a.className = 'action-btn';
      // prefer urlIndex on homepage
      a.href = isIndexPage ? (it.urlIndex || it.url || '#') : (it.url || '#');

      // internal vs external target
      if (!/^mailto:/i.test(a.href)) {
        const isInternal = a.href.startsWith(location.origin) || a.href.startsWith('/');
        if (isInternal) {
          a.removeAttribute('target');
          a.removeAttribute('rel');
        } else {
          a.target = '_blank';
          a.rel = 'noopener';
        }
      }

      a.innerHTML = `
        <div>${it.emoji ? `<span style="margin-right:8px">${it.emoji}</span>` : ''}${it.title || ''}</div>
        ${it.subtitle ? `<small class="action-meta">${it.subtitle}</small>` : ''}`;
      stack.appendChild(a);
    });

    // mirrored footer
    if (footerHref && footerLabel) {
      wrap.appendChild(makeMirrorFooter(footerHref, footerLabel));
    }

    return wrap;
  }

  // LEFT = Recent (top 6), RIGHT = Ongoing (all)
  const left  = recentSec  ? buildCol(recentSec,  '/cta.html',     'SEE ALL RECENT CASES')   : document.createElement('div');
  const right = ongoingSec ? buildCol(ongoingSec, '/ongoing.html', 'SEE ALL ONGOING CASES')  : document.createElement('div');

  split.appendChild(left);
  split.appendChild(right);
  container.appendChild(split);
}



async function fetchLinksJson() {
  const url = `${jsonURL}?v=${Date.now()}`; // reuse computed path (respects subfolders)
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`links.json fetch failed: ${res.status}`);
  return res.json();
}


function flattenSections(json) {
  const out = [];
  (json.sections || []).forEach(sec => {
    (sec.links || []).forEach(link => {
      out.push({ ...link, _section: sec.name || '' });
    });
  });
  return out;
}
// Prefer a homepage-specific link when provided
function linkForIndex(item) {
  // If urlIndex exists, index.html should use it; else fall back to url; else '#'
  return (item && (item.urlIndex || item.url)) || '#';
}


function isEmailCTA(item) {
  return (item.tag || '').toLowerCase() === 'email';
}


// helper to create the mirrored purple footer bar
function makeMirrorFooter(href, label) {
  const footer = document.createElement('div');
  footer.className = 'section-footer mirrored-bar';
  footer.innerHTML = `<a class="footer-link" href="${href}">${label}</a>`;
  return footer;
}

// ===== Updates Page: render from /data/updates.json + wire filters/search =====
async function buildUpdatesPage() {
  const section = document.getElementById('updates');
  if (!section) return;                  // not on updates.html

  const listEl = section.querySelector('.updates-list');
  const bar    = section.querySelector('.filter-bar');
  const search = bar?.querySelector('#search');
  if (!listEl) return;

  // --- load JSON (try common paths so it works in subfolders too)
  const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '/');
  const candidates = [
    new URL('data/updates.json', location.origin + base).href,
    new URL('/data/updates.json', location.origin).href,
    new URL('assets/data/updates.json', location.origin + base).href,
    new URL('/assets/data/updates.json', location.origin).href,
    new URL('updates.json', location.origin + base).href,
    new URL('/updates.json', location.origin).href
  ];

  let data = null;
  for (const href of candidates) {
    try { const r = await fetch(href, { cache: 'no-store' }); if (r.ok) { data = await r.json(); break; } } catch {}
  }
  if (!data) { listEl.innerHTML = '<div class="mini">Couldn’t load updates.</div>'; return; }

  // --- normalize + sort newest → oldest
  const items = (data.items || []).map((it, i) => ({
    id: it.id || `u${i}`,
    title: it.title || 'Untitled',
    date: it.date || '',
    status: (it.status || 'open').toLowerCase(),     // open/ongoing/resolved
    location: it.location || '',
    summary: it.summary || '',
    takeAction: it.takeAction || '',                 // URL
    links: Array.isArray(it.links) ? it.links : []
  })).sort((a, b) => (b.date || '').localeCompare(a.date || ''));

  // --- render cards
  const cards = items.map(it => {
    const art = document.createElement('article');
    art.className = 'update-card';
    art.dataset.status = it.status;

    const h3 = document.createElement('h3');
    h3.className = 'case-title';
    h3.textContent = it.title;
    art.appendChild(h3);

    if (it.date) {
      const p = document.createElement('p');
      p.className = 'date';
      try {
        const d = new Date(it.date);
        p.textContent = 'Updated: ' + d.toLocaleDateString(undefined,{month:'short',day:'2-digit',year:'numeric'});
      } catch { p.textContent = 'Updated: ' + it.date; }
      art.appendChild(p);
    }

    if (it.location) {
      const p = document.createElement('p');
      p.className = 'location';
      p.textContent = it.location;
      art.appendChild(p);
    }

    if (it.summary) {
      const p = document.createElement('p');
      p.className = 'summary';
      p.textContent = it.summary;
      art.appendChild(p);
    }

    if (it.links.length) {
      const ul = document.createElement('ul');
      ul.className = 'links';
      it.links.forEach(l => {
        const li = document.createElement('li');
        const a = document.createElement('a');
        a.textContent = l.label || 'Link';
        a.href = l.url || '#';
        if (/^https?:\/\//i.test(a.href)) { a.target = '_blank'; a.rel = 'noopener'; }
        li.appendChild(a);
        ul.appendChild(li);
      });
      art.appendChild(ul);
    }

    const status = document.createElement('span');
    status.className = `status ${it.status}`;
    status.textContent = it.status.charAt(0).toUpperCase() + it.status.slice(1);
    art.appendChild(status);

    if (it.takeAction) {
      const a = document.createElement('a');
      a.className = 'action-btn';
      a.href = it.takeAction;
      if (/^https?:\/\//i.test(a.href)) { a.target = '_blank'; a.rel = 'noopener'; }
      a.textContent = 'Take Action';
      art.appendChild(a);
    }

    return art;
  });

  listEl.replaceChildren(...cards);

  // --- wire filters/search (works on newly-rendered cards)
  const buttons = Array.from(bar?.querySelectorAll('button[data-status]') || []);
  let activeStatus = 'all';
  let query = '';

  function applyFilter(){
    const q = query.trim().toLowerCase();
    cards.forEach(card => {
      const okStatus = (activeStatus === 'all') || (card.dataset.status === activeStatus);
      const okSearch = !q || card.textContent.toLowerCase().includes(q);
      card.style.display = (okStatus && okSearch) ? '' : 'none';
    });
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeStatus = btn.dataset.status || 'all';
      applyFilter();
    });
  });

  search?.addEventListener('input', e => {
    query = e.target.value || '';
    applyFilter();
  });
}

// boot it
document.addEventListener('DOMContentLoaded', () => {
  buildUpdatesPage().catch(err => console.error('[updates]', err));
});

// ---- RESCUES & CHARITIES (Accordion, 2 columns) ----
async function buildRescuesCharitiesPage() {
  const host = document.getElementById('rescues-charities-grid');
  if (!host) return; // not on this page

  const data = await fetchJSONcandidates('rescues-charities.json');

  // We expect: { sections: [ { name, rescues:[...] }, { name, charities:[...] } ] }
  const rescuesSec   = (data.sections || []).find(s => Array.isArray(s.rescues));
  const charitiesSec = (data.sections || []).find(s => Array.isArray(s.charities));

  // Small helper → same accordion shell as CTA page
  const toID = (s) => String(s || '')
    .toLowerCase().replace(/['"]/g,'').replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');

  function itemAccordion(it) {
    const id = 'rc-' + toID(it.title || it.name || crypto.randomUUID());
    const title = it.title || it.name || 'Untitled';

    // meta: location line under the title when opened
    const locParts = [];
    if (it.region)  locParts.push(it.region);
    if (it.country) locParts.push(it.country);
    const locationLine = locParts.length ? `<p class="summary"><strong>Location:</strong> ${locParts.join(', ')}</p>` : '';

    // contacts block
    const contactBits = [];
    if (it.email)     contactBits.push(`<a class="action-btn" href="mailto:${it.email}">Email</a>`);
    if (it.instagram) contactBits.push(`<a class="action-btn" href="${it.instagram}" target="_blank" rel="noopener">Instagram</a>`);
    if (it.facebook)  contactBits.push(`<a class="action-btn" href="${it.facebook}" target="_blank" rel="noopener">Facebook</a>`);
    if (it.url)       contactBits.push(`<a class="action-btn" href="${it.url}" target="_blank" rel="noopener">Website</a>`);

    const contacts = contactBits.length
      ? `<div class="cta-foot" style="gap:10px;flex-wrap:wrap">${contactBits.join('')}</div>`
      : '';

    const desc = it.description ? `<p>${it.description}</p>` : '';

    return `
      <article class="cta-item" role="listitem">
        <button class="cta-head" aria-expanded="false" aria-controls="${id}">
          <span class="title">${title}</span>
        </button>
        <div id="${id}" class="cta-body" hidden>
          ${locationLine}
          ${desc}
          ${contacts}
        </div>
      </article>
    `;
  }

  function renderColumn(heading, items) {
    return `
      <section class="partners-col">
        <h3 class="col-title">${(heading || '').toUpperCase()}</h3>
        <div class="partners-list rc-list" role="list">
          ${(items || []).map(itemAccordion).join('')}
        </div>
      </section>
    `;
  }

  host.innerHTML = [
    renderColumn(rescuesSec?.name || 'Verified Rescues', rescuesSec?.rescues || []),
    renderColumn(charitiesSec?.name || 'Verified Charities', charitiesSec?.charities || [])
  ].join('');

  // Bind the same accordion behaviour used on CTA/Ongoing (simple toggle)
  host.querySelectorAll('.rc-list .cta-head').forEach(head => {
    head.addEventListener('click', () => {
      const expanded = head.getAttribute('aria-expanded') === 'true';
      const body = head.nextElementSibling;
      head.setAttribute('aria-expanded', String(!expanded));
      body.hidden = expanded;
    });
  });
}

// Boot it
document.addEventListener('DOMContentLoaded', () => {
  buildRescuesCharitiesPage().catch(err => console.error('[rescues-charities]', err));
});
// ===== RESOURCES PAGE (two columns, no accordion) =====
async function buildResourcesPage() {
  const section = document.getElementById('resources');
  if (!section) return; // not on resources.html

  const guidesList = document.getElementById('guides-list');
  const eduList    = document.getElementById('edu-list');
  if (!guidesList || !eduList) return;

  // Load /data/resources.json (with fallbacks)
  const data = await fetchJSONcandidates('resources.json');

  // Normalise
  const sections = Array.isArray(data.sections) ? data.sections : [];
  const byName = Object.fromEntries(
    sections.map(s => [String(s.name || '').toLowerCase(), s])
  );

  const guides = byName['practical guides']?.links || [];
  const edu    = byName['awareness & education']?.links || [];

  // Button factory
  const makeBtn = (it) => {
    const a = document.createElement('a');
    a.className = 'action-btn';
    a.href = it.url || '#';

    // Internal vs external target handling
    if (!/^mailto:/i.test(a.href)) {
      const isInternal = a.href.startsWith(location.origin) || a.href.startsWith('/');
      if (!isInternal) { a.target = '_blank'; a.rel = 'noopener'; }
    }

   a.innerHTML = `<div>${it.title || 'Untitled'}</div>
    `;
    return a;
  };

  guidesList.replaceChildren(...guides.map(makeBtn));
  eduList.replaceChildren(...edu.map(makeBtn));
}

// Boot it
document.addEventListener('DOMContentLoaded', () => {
  buildResourcesPage().catch(err => console.error('[resources]', err));
});



/* ===== Timed Subscribe Popup (5 seconds) ===== */
(function () {
  if (window.__hfaTimedPopupBound) return;
  window.__hfaTimedPopupBound = true;

  const popup = document.getElementById('subscribe-popup');
  if (!popup) return;

  const LS = window.localStorage;
  const SS = window.sessionStorage;
  const OPT_OUT_KEY = 'noSubscribePopup';
  const SHOWN_KEY = 'hfa_subscribeShown';
  const DELAY_MS = 5000; // 5 seconds

  const closeBtn = popup.querySelector('.popup-close');
  const dontAsk = popup.querySelector('#dont-ask-again');
  const form = popup.querySelector('form');

  // small helper
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function hidePopup() {
  popup.classList.add('hidden');
}

function showPopup(force = false) {
  // ignore gates if forcing
  if (!force) {
    if (LS.getItem(OPT_OUT_KEY) === 'true' || SS.getItem(SHOWN_KEY) === '1') return;
  }
  popup.classList.remove('hidden');
  popup.style.zIndex = '999999'; // ensure on top
  SS.setItem(SHOWN_KEY, '1');
}

window.hfaPopup = {
  show: (force = false) => showPopup(!!force),
  hide: hidePopup
};

  // wire buttons
  closeBtn?.addEventListener('click', hidePopup);
  dontAsk?.addEventListener('change', e => {
    LS.setItem(OPT_OUT_KEY, e.target.checked ? 'true' : 'false');
    if (e.target.checked) hidePopup();
  });
form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const emailInput =
    form.querySelector('input[type="email"]') ||
    form.querySelector('input[name="email"]') ||
    document.getElementById('sub-email');

  const email = (emailInput?.value || '').trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    emailInput?.focus();
    return;
  }

  // get (or create) a small status line
  let note = panel.querySelector('.popup-note');
  if (!note) {
    note = document.createElement('div');
    note.className = 'popup-note';
    note.style.marginTop = '8px';
    note.style.fontSize = '0.95rem';
    panel.appendChild(note);
  }
  note.textContent = 'Subscribing…';
  note.style.color = '#2a9d8f';

  // prevent double submits
  const submitBtn = form.querySelector('button[type="submit"], .popup-submit');
  submitBtn?.setAttribute('disabled', 'disabled');

  // send
  const r = await postToButtondown(email);

  if (r.ok) {
    // replace the WHOLE panel with success screen
    panel.innerHTML = `
      <div style="padding:24px;text-align:center">
        <h3 style="margin:0 0 8px;font-size:1.25rem">Check your inbox</h3>
        <p style="margin:0 0 16px">
          We’ve sent a confirmation to <strong>${escapeHtml(email)}</strong>.
        </p>
        <button id="popup-close-btn" style="padding:10px 16px;border-radius:8px;border:none;cursor:pointer">
          Close
        </button>
      </div>
    `;
    panel.querySelector('#popup-close-btn')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      try { form.reset(); } catch {}
      setTimeout(() => { try { window.hfaPopup?.hide?.(); } catch {} }, 50);
    });

    // also close if the user clicks outside the content
    popup.addEventListener('click', (ev) => {
      if (ev.target === popup) {
        try { form.reset(); } catch {}
        setTimeout(() => { try { window.hfaPopup?.hide?.(); } catch {} }, 50);
      }
    }, { once: true });

  } else {
    // keep the form and show the real reason from Buttondown
    note.textContent = r.msg || 'Subscribe failed. Please try again.';
    note.style.color = '#e63946';
    submitBtn?.removeAttribute('disabled');
  }
});


const panel =
  popup.querySelector('[data-popup-panel]') ||
  popup.querySelector('.popup-card,.popup-inner,.popup-content') ||
  popup; // fallback to whole popup block



  // wait until DOM visible, then start timer
  function startTimer() {
    if (document.visibilityState === 'visible') {
      setTimeout(showPopup, DELAY_MS);
    } else {
      // wait until tab is visible first
      const onVisible = () => {
        if (document.visibilityState === 'visible') {
          document.removeEventListener('visibilitychange', onVisible);
          setTimeout(showPopup, DELAY_MS);
        }
      };
      document.addEventListener('visibilitychange', onVisible);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startTimer);
  } else {
    startTimer();
  }

  // helper for testing
  window.hfaPopup = { show: showPopup, hide: hidePopup };
})();

// === CTA Submissions: backend-integrated (Turnstile + Mail proxy) ===
(function(){
  const form = document.getElementById('submission-form');
  if (!form) return;

  const statusOK  = document.getElementById('submit-ok');
  const statusBad = document.getElementById('submit-bad');
  const desc      = form.querySelector('textarea[name="description"]');
  const descCount = document.getElementById('desc-count');
  const evidence  = form.querySelector('textarea[name="evidence"]');
  const evidenceErr = document.getElementById('evidence-errors');
  const captchaWrap = document.getElementById('captcha-wrap');

  // ------------- CONFIG -------------
  const endpoint = 'https://hfa-submissions-proxy.hallieforanimals.workers.dev/';

  // ------------- UX HELPERS -------------
  function setOK(msg)  { if (statusBad) statusBad.hidden = true; if (statusOK) { statusOK.textContent = msg || 'Thanks - your submission has been recorded.'; statusOK.hidden = false; } }
  function setBad(msg) { if (statusOK) statusOK.hidden = true; if (statusBad){ statusBad.textContent = msg || 'Something’s missing or invalid. Please check the highlighted fields.'; statusBad.hidden = false; } }

  // live counter
  function updateCount(){ if (desc && descCount) descCount.textContent = String(desc.value.length); }
  desc?.addEventListener('input', updateCount);
  updateCount();

  // evidence: one URL per line
  function validateEvidence(){
    if (!evidence) return true;
    evidenceErr.textContent = '';
    const lines = (evidence.value || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) { evidenceErr.textContent = 'Please include at least one evidence URL.'; return false; }
    const urlish = /^(?:(?:https?:\/\/)?(?:www\.)?|www\.)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9-]+)+(?:[\/?#][^\s]*)?$/i;
    const bad = lines.filter(l => !urlish.test(l));
    if (bad.length) {
      evidenceErr.textContent = `Invalid URL${bad.length>1?'s':''}: ${bad.slice(0,3).join(', ')}${bad.length>3?'…':''}`;
      return false;
    }
    return true;
  }
  evidence?.addEventListener('blur', validateEvidence);


// ------------- TURNSTILE -------------

const SITEKEY = '0x4AAAAAAB-QUsgpCF_PFhLt';  // <- keep your key
let widgetId = null;

function whenTurnstileReady(cb) {
  if (window.turnstile && typeof window.turnstile.render === 'function') return cb();
  const t = setInterval(() => {
    if (window.turnstile && typeof window.turnstile.render === 'function') {
      clearInterval(t);
      cb();
    }
  }, 25);
}

// Render the captcha as soon as the API is ready (keeps it visible)
document.addEventListener('DOMContentLoaded', () => {
  whenTurnstileReady(() => {
    const holder = document.querySelector('#captcha-wrap');
    if (holder) holder.style.display = 'block';
    if (!widgetId) {
      widgetId = window.turnstile.render('#captcha-wrap', {
        sitekey: SITEKEY,
        theme: 'light',
        callback: (token) => { window.TS_DEBUG = { sitekey: SITEKEY, token, widgetId }; },
        'expired-callback': () => { try { window.turnstile.reset(widgetId); } catch {} },
        'error-callback': () => {}
      });
    }
  });
});


async function ensureCaptcha() {
  // 1) If Turnstile already injected a hidden input with a fresh token, prefer that
  const tokenInput = document.querySelector('#submission-form input[name="cf-turnstile-response"]');
  if (tokenInput?.value) {
    window.TS_DEBUG = { sitekey: SITEKEY, token: tokenInput.value, widgetId };
    return tokenInput.value;
  }

  // 2) Otherwise, read the token from the visible widget we rendered on load
  await new Promise((r) => whenTurnstileReady(r)); // ensure api.js ready

  // try up to ~1s in case token isn’t issued yet
  for (let i = 0; i < 10; i++) {
    try {
      const t = window.turnstile.getResponse(widgetId);
      if (t) {
        window.TS_DEBUG = { sitekey: SITEKEY, token: t, widgetId };
        return t;
      }
    } catch { /* widget not ready yet */ }
    await new Promise(r => setTimeout(r, 100));
  }

  // If still no token, ask user to try again
  throw new Error('Captcha not ready');
}



  // ------------- SUBMIT -------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // clear previous error highlights
    form.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
    setOK(''); setBad('');

    let ok = true;

    // Match THIS page’s actual required fields
    const requiredNames = ['country','description','reporterEmail']; // these exist on contact.html
    requiredNames.forEach(name => {
      const input = form.querySelector(`[name="${name}"]`);
      const wrap  = input?.closest('label');
      if (!input || !String(input.value || '').trim()) { wrap?.classList.add('is-error'); ok = false; }
    });

    // email format
    const em = form.querySelector('[name="reporterEmail"]');
if (em && em.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value)) {
  em.closest('label')?.classList.add('is-error'); ok = false;
}


    // evidence URLs
    if (!validateEvidence()) { evidence?.closest('label')?.classList.add('is-error'); ok = false; }

    // consent checkboxes
    ['consentTruth','consentShare','consentPrivacy'].forEach(name => {
      const cb = form.querySelector(`[name="${name}"]`);
      if (!cb?.checked) { cb?.closest('label')?.classList.add('is-error'); ok = false; }
    });

    // honeypot
    const hp = form.querySelector('[name="website"]');
    if (hp && hp.value.trim()) ok = false;

    if (!ok) { setBad(); return; }

    // Get (or render) Turnstile token
    let turnstileToken = '';
    try {
      turnstileToken = await ensureCaptcha();
    } catch (err) {
      setBad('Captcha failed. Please try again.');
      return;
    }

    // Build payload for Worker
    const fd = new FormData(form);
    const evidenceLines = (fd.get('evidence') || '').toString().split(/\r?\n/).map(s => s.trim()).filter(Boolean);

const tokenFromInput = form.querySelector('[name="cf-turnstile-response"]')?.value || '';
const token = turnstileToken || tokenFromInput;

const payload = {
  formType: 'submission',
  subjectRaw: 'HFA Submission CTA',
  // Core
  country: fd.get('country') || '',
  city:    fd.get('city')    || '',
  date:    fd.get('date')    || '',
  description: fd.get('description') || '',
  evidence: evidenceLines.join('\n'),   // ← string, not array

  // Reporter
  reporterName:  fd.get('reporterName')  || '',
  reporterEmail: fd.get('reporterEmail') || '',
  handle:        fd.get('handle')        || '',

  // Consents
  consentTruth:   !!fd.get('consentTruth'),
  consentShare:   !!fd.get('consentShare'),
  consentPrivacy: !!fd.get('consentPrivacy'),

  // Anti-spam
  website: fd.get('website') || '',

  // Captcha — send under multiple common keys (server will pick one)
  "cf-turnstile-response": token,
  turnstileToken: token,
  token: token,
  response: token
};



 try {
  // Send JSON — Worker calls request.json()
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  let out;
  try { out = await res.json(); } catch { out = await res.text(); }

  if (res.ok && (out?.ok || res.status === 200)) {
    form.reset();
    updateCount();
    try { if (widgetId != null && window.turnstile) window.turnstile.reset(widgetId); } catch {}
    setOK('Thanks — your submission was received.');
   } else {
console.debug('Submit error payload:', out);
const codes = out?.detail?.['error-codes'] || out?.detail?.error_codes || out?.errors || [];
const hint  = Array.isArray(codes) && codes.length ? ` (${codes.join(', ')})` : '';
const mc    = out?.mc_status ? ` [MC ${out.mc_status}]` : '';
const snip  = (typeof out?.detail === 'string' ? out.detail : '').replace(/\s+/g,' ').slice(0,200);
setBad(out?.error ? `Send failed: ${out.error}${hint}${mc}${snip ? ' — ' + snip : ''}` : 'Send failed. Please try again.');

   }
  
} catch (err) {
  console.error(err);
  setBad('Network error. Please try again.');
}
  });
})();


// ===== Burger + layout for current markup =====
(function(){
  const root   = document.documentElement;
  const banner = document.getElementById('banner');
  const header = document.querySelector('.site-header');
  const nav    = document.querySelector('.main-nav');
  const menu   = document.getElementById('nav-menu');
  const btn    = document.getElementById('nav-toggle');

  // keep CSS vars in sync with real banner/header heights
  function setVars(){
    const bH = (banner && !banner.hasAttribute('hidden')) ? banner.offsetHeight : 0;
    root.style.setProperty('--banner-h', (bH || 0) + 'px');
    if (header) root.style.setProperty('--header-h', header.offsetHeight + 'px');
  }
  setVars();
  addEventListener('load', setVars);
  addEventListener('resize', setVars);

  // if banner becomes visible later, update the height
  if (banner) {
    const mo = new MutationObserver(setVars);
    mo.observe(banner, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
  }

  if (!btn || !nav || !menu) return;

  function openNav(){
    btn.setAttribute('aria-expanded','true');
    nav.classList.add('open');
    menu.classList.add('open');
    nav.removeAttribute('aria-hidden');
    document.documentElement.classList.add('nav-open');
    document.body.classList.add('nav-open');
    const first = menu.querySelector('a'); if (first) first.focus({preventScroll:true});
  }
  function closeNav(){
    btn.setAttribute('aria-expanded','false');
    nav.classList.remove('open');
    menu.classList.remove('open');
    nav.setAttribute('aria-hidden','true');
    document.documentElement.classList.remove('nav-open');
    document.body.classList.remove('nav-open');
    btn.focus({preventScroll:true});
  }
  function toggleNav(){ (nav.classList.contains('open') ? closeNav() : openNav()); }

  btn.addEventListener('click', toggleNav);
  document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeNav(); });
  menu.addEventListener('click', (e)=>{ if (e.target.matches('a')) closeNav(); });
})();

function ctaActionLabel(item) {
  // Custom label override in JSON
  if (item.buttonText) return item.buttonText;

  const url = item.url || '';
  const t = (item.tag || '').toLowerCase();

  // Detect internal links (like /ongoing.html#case)
  if (/\/ongoing\.html/i.test(url)) return 'View ongoing case';
  if (/^#/.test(url)) return 'View details';

  // Detect standard CTA types
  if (t === 'email') return 'Send the one-click email';
  if (t === 'petition') return 'Sign the petition';
  if (t === 'donate') return 'Donate';
  if (t === 'call') return 'Make the call';

  // Default fallback
  return 'Open action';
}


function renderTargets(targets) {
  if (!Array.isArray(targets) || !targets.length) return '';
  return `<div class="mini"><strong>Targets:</strong> ${targets.join(', ')}</div>`;
}

function renderPhones(phones) {
  if (!Array.isArray(phones) || !phones.length) return '';
  const rows = phones.map(p => {
    const who = p.who ? `${p.who}: ` : '';
    const ext = p.ext ? ` ext. ${p.ext}` : '';
    return `${who}${p.main || ''}${ext}`;
  }).join('<br>');
  return `<div class="mini"><strong>Call:</strong><br>${rows}</div>`;
}

// --- Helpers to linkify targets and telephone numbers ---
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const URL_RE   = /^https?:\/\/[^\s]+$/i;
const HANDLE_RE = /^@([A-Za-z0-9_]{1,15})$/; // treat as X/Twitter
// Make plain URLs/emails/@handles clickable, but leave existing HTML alone
function linkify(input) {
  if (!input) return '';
  const s = String(input);
  // if it already contains HTML tags (e.g., <a>), don’t touch it
  if (/<[a-z][\s\S]*>/i.test(s)) return s;

  let out = s;

  // URLs
  out = out.replace(/https?:\/\/[^\s<]+/gi, (m) => `<a href="${m}" target="_blank" rel="noopener">${m}</a>`);

  // emails
  out = out.replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/gi, (m) => `<a href="mailto:${m}">${m}</a>`);

  // @handles (X/Twitter) — keep it simple
  out = out.replace(/(^|\s)@([A-Za-z0-9_]{1,15})\b/g, (_m, p1, h) => `${p1}<a href="https://x.com/${h}" target="_blank" rel="noopener">@${h}</a>`);

  return out;
}


function linkifyTarget(s) {
  if (!s) return '';
  const t = s.trim();
  if (EMAIL_RE.test(t)) {
    return `<a href="mailto:${t}">${t}</a>`;
  }
  if (URL_RE.test(t)) {
    return `<a href="${t}" target="_blank" rel="noopener">${t}</a>`;
  }
  const m = t.match(HANDLE_RE);
  if (m) {
    const handle = m[1];
    return `<a href="https://x.com/${handle}" target="_blank" rel="noopener">@${handle}</a>`;
  }
  // fallback: plain text
  return t;
}

// RFC3966 tel: with ;ext=
function telUri(number, ext) {
  const num = String(number || '').replace(/[^\d+]/g, '');
  const extPart = ext ? `;ext=${encodeURIComponent(ext)}` : '';
  return `tel:${num}${extPart}`;
}

function renderTargetsList(arr) {
  if (!Array.isArray(arr) || !arr.length) return '';
  const items = arr.map(t => `<li>${linkifyTarget(t)}</li>`).join('');
  return `<div class="cta-section">
           <h4>Targets</h4>
           <ul class="targets">${items}</ul>
         </div>`;
}

function renderPhonesClickable(phones) {
  if (!Array.isArray(phones) || !phones.length) return '';
  const rows = phones.map(p => {
    const who   = p.who ? `<strong>${p.who}:</strong> ` : '';
    const href  = telUri(p.main, p.ext);
    const label = [p.main, p.ext ? `ext. ${p.ext}` : ''].filter(Boolean).join(' ');
    return `<li>${who}<a href="${href}" aria-label="Call ${p.who || ''} ${label}">${label}</a></li>`;
  }).join('');
  return `<div class="cta-section">
           <h4>Phone</h4>
           <ul class="targets">${rows}</ul>
         </div>`;
}

// Normalize an Instagram permalink (handles /reel/, /p/, /tv/ formats)
function toInstaPermalink(url) {
  if (!url) return '';
  try {
    const u = new URL(url, location.origin);
    // keep only path up to the media id segment
    // e.g. /reel/ABC123/whatever?x=y -> /reel/ABC123/
    const m = u.pathname.match(/\/(reel|p|tv)\/([^\/?#]+)/i);
    if (!m) return '';
    return `https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/`;
  } catch {
    return '';
  }
}

// Load Instagram embed script only once, then process new embeds
function loadInstaEmbedScriptOnce() {
  return new Promise((resolve) => {
    if (window.instgrm && window.instgrm.Embeds) {
      resolve(window.instgrm);
      return;
    }
    // already adding?
    if (document.getElementById('insta-embed-js')) {
      const check = () => {
        if (window.instgrm && window.instgrm.Embeds) resolve(window.instgrm);
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    const s = document.createElement('script');
    s.id = 'insta-embed-js';
    s.src = 'https://www.instagram.com/embed.js';
    s.async = true;
    s.onload = () => resolve(window.instgrm);
    document.head.appendChild(s);
  });
}


async function renderCtaAccordions() {
  const grid = document.getElementById('cta-grid');
  if (!grid) return;

  try {
    const data  = await fetchLinksJson();
    const items = flattenSections(data).filter(isActionCTA);

    grid.classList.add('cta-accord');

    grid.innerHTML = items.map((item, idx) => {
      const id       = `cta-item-${idx}`;
      const title    = item.title || 'Untitled';
      const summary  = item.summary || '';
      const updated  = item.updated ? `<div class="mini"><em>Updated: ${item.updated}</em></div>` : '';

      const instaPermalink = item.instagram ? toInstaPermalink(item.instagram) : '';

      // ⬇️ CHANGED: embed + fallback UI
      const instagramBlock = instaPermalink
        ? `<div class="cta-section insta-embed" data-insta="${instaPermalink}">
             <blockquote class="instagram-media"
               data-instgrm-permalink="${instaPermalink}"
               data-instgrm-version="14"
               style="background:#fff; border:0; margin:0 auto; max-width:540px; width:100%;">
             </blockquote>
             <div class="insta-fallback" hidden>
               <div class="insta-warning">This post can’t be embedded here (likely age-restricted).</div>
               <p class="insta-note">You can still watch it directly on Instagram:</p>
               <p class="insta-action">
                 <a class="action-btn" href="${instaPermalink}" target="_blank" rel="noopener">Open on Instagram</a>
               </p>
             </div>
           </div>`
        : '';

      const descBlock = item.description
        ? `<div class="cta-section">
             <h4>Description</h4>
             <p>${item.description}</p>
           </div>`
        : '';

      const targetsBlock = renderTargetsList(item.targets);
      const locationBlock = item.location
        ? `<div class="cta-section">
             <h4>Location</h4>
             <p>${[
                  item.location.country,
                  item.location.region,
                  item.location.locality
                ].filter(Boolean).join(', ')}</p>
           </div>`
        : '';

      const phonesBlock = renderPhonesClickable(item.phones);
      const notesBlock = item.extra
        ? `<div class="cta-section">
             <h4>Notes</h4>
             <p>${item.extra}</p>
           </div>`
        : '';

      const isMailto   = /^mailto:/i.test(item.url || '');
      const isInternal = /^\/|^#/.test(item.url || ''); // starts with "/" or "#"
      const targetRel  = (isMailto || isInternal) ? '' : ` target="_blank" rel="noopener"`;


      return `
        <article class="cta-item" role="listitem">
          <button class="cta-head" aria-expanded="false" aria-controls="${id}">
            <span class="title">${title}</span>
          </button>
          <div id="${id}" class="cta-body" hidden>
            ${summary ? `<p class="summary">${summary}</p>` : ''}

            ${instagramBlock}

            ${descBlock}
            ${targetsBlock}
            ${locationBlock}
            ${phonesBlock}
            ${notesBlock}

            ${updated}

            ${(item.tag || '').toLowerCase() === 'appeal' ? `
    <div class="cta-badge appeal">Appeal For Information</div>
  ` : ''}

            ${item.url ? `
  <div class="cta-foot">
    <a class="action-btn" href="${item.url}"${targetRel}>
      ${ctaActionLabel(item)}
    </a>
  </div>
` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    // ⬇️ CHANGED: process embeds + show fallback if no iframe appears
    grid.querySelectorAll('.cta-head').forEach(head => {
      head.addEventListener('click', async () => {
        const expanded = head.getAttribute('aria-expanded') === 'true';
        const body = head.nextElementSibling;
        head.setAttribute('aria-expanded', String(!expanded));
        body.hidden = expanded;

        if (!expanded) {
          const wraps = body.querySelectorAll('.insta-embed');
          if (wraps.length) {
            const ig = await loadInstaEmbedScriptOnce();
            ig?.Embeds?.process();

            wraps.forEach(wrap => {
              const tryFallback = () => {
                const hasIframe = !!wrap.querySelector('iframe');
                if (!hasIframe) {
                  wrap.querySelector('.instagram-media')?.remove();
                  wrap.querySelector('.insta-fallback')?.removeAttribute('hidden');
                }
              };
              setTimeout(tryFallback, 1200);
              setTimeout(tryFallback, 3000);
            });
          }
        }
      });
    });

    // Optional: process any Instagram embeds visible on initial load
    if (grid.querySelector('.instagram-media:not([data-processed])')) {
      loadInstaEmbedScriptOnce().then(ig => ig?.Embeds?.process());
    }

  } catch (e) {
    console.error(e);
  }
}

// === HFA analytics helpers for CTA listing ===
function enhanceCtaAnchors(container){
  // Find any action links that already point to a shortlink
  const anchors = container.querySelectorAll('a[href*="/s/"]');
  anchors.forEach(a => {
    const href = a.getAttribute('href') || '';
    const m = href.match(/\/s\/([^/?#]+)/i);
    if (!m) return;
    const slug = decodeURIComponent(m[1]);

    if (!a.hasAttribute('data-analytics-el')) {
      a.setAttribute('data-analytics-el', 'primary_button');
    }
    a.setAttribute('data-slug', slug);

    const card = a.closest('[data-cta-card], .cta-item, article, li, div');
    if (card && !card.hasAttribute('data-cta-card')) {
      card.setAttribute('data-cta-card', slug);
    }
  });
}

// Optional: per-CTA "impression" when 50% of the card is visible
function setupCtaImpressions(container){
  const cards = container.querySelectorAll('[data-cta-card]');
  if (!cards.length || !('IntersectionObserver' in window)) return;

  const seen = new Set();
  const io = new IntersectionObserver((entries) => {
    for (const ent of entries){
      if (ent.isIntersecting && ent.intersectionRatio >= 0.5){
        const slug = ent.target.getAttribute('data-cta-card') || '';
        if (!slug || seen.has(slug)) continue;
        seen.add(slug);
        // track-lite.js will listen for this and send the beacon
        window.dispatchEvent(new CustomEvent('hfa-impression', { detail: { slug } }));
      }
    }
  }, { threshold: [0.5] });

  cards.forEach(c => io.observe(c));
}


/* ==========================================================
   Ongoing page: accordion grid fed by links.json
   - Sources items from the "Ongoing Cases" section
   - Renders description, description2, description3[], targets[],
     primary button (url/buttonText) and secondary (url2/buttonText2)
   ========================================================== */
async function renderOngoingAccordions() {
  const grid = document.getElementById('ongoing-grid');
  if (!grid) return; // not on ongoing.html

  const toSlug = (s) => String(s || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  try {
    const data = await fetchLinksJson();
    const ongoingSec = (data.sections || []).find(s => /ongoing/i.test(s?.name || ''));
    const items = Array.isArray(ongoingSec?.links) ? ongoingSec.links.slice() : [];

    // newest → oldest if date exists
    items.sort((a,b) => new Date(b.date||0) - new Date(a.date||0));

    grid.innerHTML = items.map((item, idx) => {
      const title = item.title || 'Untitled';
      const slug  = item.slug ? toSlug(item.slug) : toSlug(title);
      const id    = `og-${slug || ('item-' + idx)}`;

      // descriptions
      const desc1 = item.description  ? `<p>${item.description}</p>` : '';
      const desc2 = item.description2 ? `<p>${item.description2}</p>` : '';
      const desc3 = Array.isArray(item.description3) && item.description3.length
        ? `<ul>${item.description3.map(li => `<li>${li}</li>`).join('')}</ul>`
        : '';

      const descBlock = (desc1 || desc2 || desc3)
        ? `<div class="desc">${desc1}${desc2}${desc3}</div>` : '';

      // targets
      const targetsBlock = Array.isArray(item.targets) && item.targets.length
        ? `<div class="targets"><h3 class="minihead">Targets</h3><ul>${item.targets.map(t => `<li>${t}</li>`).join('')}</ul></div>`
        : '';

      // updated stamp (optional)
      const updated = item.updated ? `<div class="updated mini">${item.updated}</div>` : '';

      // primary & secondary buttons
      const btn1 = item.url && item.buttonText
        ? `<a class="action-btn" href="${item.url}" ${/^mailto:|^\/|^#/i.test(item.url) ? '' : 'target="_blank" rel="noopener"'}>${item.buttonText}</a>`
        : '';

      const btn2 = item.url2 && item.buttonText2
        ? `<a class="action-btn" href="${item.url2}" ${/^mailto:|^\/|^#/i.test(item.url2) ? '' : 'target="_blank" rel="noopener"'}>${item.buttonText2}</a>`
        : '';

      const buttons = (btn1 || btn2) ? `<div class="cta-foot">${btn1}${btn2}</div>` : '';

      return `
        <article id="${slug}" class="cta-item" role="listitem">
          <button class="cta-head" aria-expanded="false" aria-controls="${id}">
            <span class="title">${title}</span>
          </button>
          <div id="${id}" class="cta-body" hidden>
            ${descBlock}
            ${targetsBlock}
            ${updated}
            ${buttons}
          </div>
        </article>
      `;
    }).join('') || '<div class="mini">No ongoing items yet.</div>';

    // HFA analytics wiring
enhanceCtaAnchors(grid);
setupCtaImpressions(grid); // comment out if you don't want impressions


    // accordion toggles
    grid.querySelectorAll('.cta-head').forEach(head => {
      head.addEventListener('click', () => {
        const expanded = head.getAttribute('aria-expanded') === 'true';
        const body = head.nextElementSibling;
        head.setAttribute('aria-expanded', String(!expanded));
        body.hidden = expanded;
      });
    });

    // deep-link open
    if (location.hash) {
      const t = document.querySelector(location.hash);
      if (t?.querySelector('.cta-head')) {
        const head = t.querySelector('.cta-head');
        head.setAttribute('aria-expanded','true');
        const body = head.nextElementSibling;
        if (body) body.hidden = false;
        t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  } catch (e) {
    console.error('[ongoing-grid]', e);
    grid.innerHTML = '<div class="mini">Couldn’t load ongoing items.</div>';
  }
}



async function buildOngoingTOC() {
  const nav = document.getElementById('ongoing-toc');
  if (!nav) return; // not on ongoing.html

  const toSlug = (s) => String(s || '')
    .toLowerCase()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  try {
    const data = await fetchLinksJson();
    const ongoingSec = (data.sections || []).find(s => /ongoing/i.test(s?.name || ''));
    const items = Array.isArray(ongoingSec?.links) ? ongoingSec.links.slice() : [];

    // keep any ordering you like (newest first if you add dates later)

    const cards = items.map(item => {
      const title = item.title || 'Untitled';

      // Prefer #hash already present in url (keeps old deep links working)
      let anchorFromUrl = '';
      try {
        const u = new URL(item.url || '', location.origin);
        anchorFromUrl = (u.hash || '').replace(/^#/, '');
      } catch { /* ignore */ }

      const slug = anchorFromUrl || toSlug(item.slug || title);
      const href = `#${slug}`;

      return `<a class="action-btn" href="${href}">${title}</a>`;
    }).join('');

    nav.innerHTML = cards || '<div class="mini">No ongoing campaigns yet.</div>';

  } catch (e) {
    console.error('[ongoing-toc]', e);
    nav.innerHTML = '<div class="mini">Couldn’t build shortcuts.</div>';
  }
}


// Safe to run on all pages; functions no-op if containers aren’t present
renderIndexEmailCTAs();
updateBannerFromFirstEmail();
renderCtaAccordions();
renderOngoingAccordions();
buildOngoingTOC();

/* ==========================================================
   Instagram WebView handoff — CTA page only
   ========================================================== */
(function igHandoffOnlyOnCTA(){
  // Wait until DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init(){
    const href = location.href.toLowerCase();
    if (!/cta\.html(\?|#|$)/.test(href)) return;   // only on CTA page

    const ua = navigator.userAgent || '';
    const isIG = /instagram|fban|fbav/i.test(ua);  // IG or FB in-app
    const params = new URLSearchParams(location.search);
    const force = params.get('igtest') === '1';    // manual test flag

    if (!isIG && !force) return;

    const bar     = document.getElementById('ig-handoff');
    const openBtn = document.getElementById('open-native');
    const copyBtn = document.getElementById('copy-link');

    if (!bar) return console.warn('[IG handoff] missing #ig-handoff');

    // ✅ Reveal it
    bar.hidden = false;

    openBtn?.addEventListener('click', () => {
      alert('In Instagram: tap ••• (top-right) → “Open in Browser”.');
    });

    copyBtn?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(location.href);
        alert('Link copied. Paste it in Safari/Chrome to open.');
      } catch {
        prompt('Copy this URL:', location.href);
      }
    });

    console.debug('[IG handoff] shown — uaMatch:', isIG, 'force:', force);
  }
})();

/* ==========================================================
   Keep IG handoff stuck under the sticky banner
   ========================================================== */
(function offsetHandoffUnderBanner(){
  // Tweak selectors if your banner uses a different id/class
  const SELECTOR = '#sticky-banner, .sticky-banner, .banner';

  function updateOffset(){
    const el = document.querySelector(SELECTOR);
    const h  = (el && el.offsetParent !== null) ? el.offsetHeight : 0;
    document.documentElement.style.setProperty('--sticky-banner-height', h + 'px');
  }

  // Run now and on changes
  window.addEventListener('load',   updateOffset);
  window.addEventListener('resize', updateOffset);

  // If the banner appears/disappears or changes height dynamically
  const mo = new MutationObserver(updateOffset);
  mo.observe(document.body, { attributes:true, childList:true, subtree:true });

  // Initial call
  updateOffset();
})();


// --- Email subscribe button (opens Buttondown link) ---
document.addEventListener('DOMContentLoaded', () => {
  const emailBtn = document.getElementById('email-subscribe-btn');
  if (emailBtn) {
    emailBtn.addEventListener('click', () => {
      window.open('https://buttondown.com/hallieforanimals', '_blank', 'noopener,noreferrer');
    });
  }
});

(() => {
  const form = document.getElementById('subscribe-form');
  if (!form) return;

  const emailEl = document.getElementById('sub-email'); // must exist
  const note = document.getElementById('sub-note');
  const btn = document.getElementById('sub-btn') || form.querySelector('button');

  const setNote = (msg, ok = false) => {
    if (!note) return;
    note.textContent = msg;
    note.style.color = ok ? '#2a9d8f' : '#e63946';
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = (emailEl?.value || '').trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return setNote('Please enter a valid email.');
    }

    btn && (btn.disabled = true);
    setNote('Subscribing…', true);

    const r = await postToButtondown(email);
    setNote(r.msg, r.ok);
    if (r.ok) form.reset();

    btn && (btn.disabled = false);
  });

})();
// === Scam Report Form (separate from #submission-form) ===
(function(){
  const form = document.getElementById('scam-form');
  if (!form) return;

  const statusOK   = document.getElementById('submit-ok');
  const statusBad  = document.getElementById('submit-bad');
  const desc       = form.querySelector('textarea[name="description"]');
  const descCount  = document.getElementById('desc-count');
  const captchaWrap = document.getElementById('captcha-wrap');

  // Optional fields on this page
  const platform   = form.querySelector('[name="platform"]');
  const scamHandle = form.querySelector('[name="scamHandle"]');
  const other      = form.querySelector('[name="other"]');

  // ---- Config ----
  const endpoint = 'https://hfa-submissions-proxy.hallieforanimals.workers.dev/';

  // ---- Helpers ----
  function setOK(msg)  { if (statusBad) statusBad.hidden = true; if (statusOK) { statusOK.textContent = msg || 'Thanks — your report was received.'; statusOK.hidden = false; } }
  function setBad(msg) { if (statusOK) statusOK.hidden = true; if (statusBad){ statusBad.textContent = msg || 'Something’s missing or invalid. Please check the highlighted fields.'; statusBad.hidden = false; } }

  function updateCount(){ if (desc && descCount) descCount.textContent = String(desc.value.length); }
  desc?.addEventListener('input', updateCount);
  updateCount();

  // ---- Turnstile (same key/flow as submissions form) ----
  const SITEKEY = '0x4AAAAAAB-QUsgpCF_PFhLt';
  let widgetId = null;

  function whenTurnstileReady(cb) {
    if (window.turnstile && typeof window.turnstile.render === 'function') return cb();
    const t = setInterval(() => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        clearInterval(t);
        cb();
      }
    }, 25);
  }

  document.addEventListener('DOMContentLoaded', () => {
    whenTurnstileReady(() => {
      if (captchaWrap) captchaWrap.style.display = 'block';
      if (!widgetId) {
        widgetId = window.turnstile.render('#captcha-wrap', {
          sitekey: SITEKEY,
          theme: 'light',
          callback: (token) => { window.TS_DEBUG = { sitekey: SITEKEY, token, widgetId }; },
          'expired-callback': () => { try { window.turnstile.reset(widgetId); } catch {} },
          'error-callback': () => {}
        });
      }
    });
  });

  async function ensureCaptcha() {
    const tokenInput = form.querySelector('input[name="cf-turnstile-response"]');
    if (tokenInput?.value) return tokenInput.value;

    await new Promise((r) => whenTurnstileReady(r));
    for (let i = 0; i < 10; i++) {
      try {
        const t = window.turnstile.getResponse(widgetId);
        if (t) return t;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Captcha not ready');
  }

  // ---- Submit ----
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // reset errors
    form.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
    setOK(''); setBad('');

    let ok = true;

    // required on scam page
    const must = ['description'];
    must.forEach(name => {
      const input = form.querySelector(`[name="${name}"]`);
      const wrap  = input?.closest('label');
      if (!input || !String(input.value || '').trim()) { wrap?.classList.add('is-error'); ok = false; }
    });

    // email format
    const em = form.querySelector('[name="reporterEmail"]');
if (em && em.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value)) {
  em.closest('label')?.classList.add('is-error'); ok = false;
}


    // required consents
    ['consentTruth','consentShare','consentPrivacy'].forEach(name => {
      const cb = form.querySelector(`[name="${name}"]`);
      if (!cb?.checked) { cb?.closest('label')?.classList.add('is-error'); ok = false; }
    });

    // honeypot
    const hp = form.querySelector('[name="website"]');
    if (hp && hp.value.trim()) ok = false;

    if (!ok) { setBad(); return; }

    // captcha
    let token = '';
    try {
      token = await ensureCaptcha();
    } catch {
      setBad('Captcha failed. Please try again.');
      return;
    }

    // payload
    const fd = new FormData(form);
    const get = (n) => (fd.has(n) ? (fd.get(n) || '').toString().trim() : '');

    const payload = {
      formType: 'scam',           // helps your Worker route/subject-line
      subjectRaw: 'HFA Submission Scam',
      description: get('description'),
      reporterName:  get('reporterName'),
      reporterEmail: get('reporterEmail'),
      // optional extras
      platform:   get('platform'),
      scamHandle: get('scamHandle'),
      other:      get('other'),
      // consents
      consentTruth:   !!fd.get('consentTruth'),
      consentShare:   !!fd.get('consentShare'),
      consentPrivacy: !!fd.get('consentPrivacy'),
      // honeypot
      website: get('website'),
      // captcha (multiple keys)
      "cf-turnstile-response": token,
      turnstileToken: token,
      token, response: token
    };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload)
      });

      let out;
      try { out = await res.json(); } catch { out = await res.text(); }

      if (res.ok && (out?.ok || res.status === 200)) {
        form.reset();
        updateCount();
        try { if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId); } catch {}
        setOK('Thanks — your report was received.');
      } else {
        const codes = out?.detail?.['error-codes'] || out?.detail?.error_codes || out?.errors || [];
        const hint  = Array.isArray(codes) && codes.length ? ` (${codes.join(', ')})` : '';
        const mc    = out?.mc_status ? ` [MC ${out.mc_status}]` : '';
        const snip  = (typeof out?.detail === 'string' ? out.detail : '').replace(/\s+/g,' ').slice(0,200);
        setBad(out?.error ? `Send failed: ${out.error}${hint}${mc}${snip ? ' — ' + snip : ''}` : 'Send failed. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setBad('Network error. Please try again.');
    }
  });
})();
  // === In Memoriam Photo Submit (with attachments) ===
(function(){
  const form = document.getElementById('memoriam-form');
  if (!form) return;

  const statusOK   = document.getElementById('submit-ok');
  const statusBad  = document.getElementById('submit-bad');
  const desc       = form.querySelector('textarea[name="description"]');
  const descCount  = document.getElementById('mem-desc-count');
  const photoErr   = document.getElementById('mem-photo-errors');
  const captchaWrap = document.getElementById('captcha-wrap');

  const endpoint = 'https://hfa-submissions-proxy.hallieforanimals.workers.dev/';

  const SITEKEY = '0x4AAAAAAB-QUsgpCF_PFhLt';
  let widgetId = null;

    // Fill "From"/"To" selects with years (current → 1950)
  function populateYearSelects() {
    const fromSel = document.getElementById('mem-year-from');
    const toSel   = document.getElementById('mem-year-to');
    if (!fromSel || !toSel) return;

    const thisYear = new Date().getFullYear();
    const minYear  = 1950;
    const fragFrom = document.createDocumentFragment();
    const fragTo   = document.createDocumentFragment();

    for (let y = thisYear; y >= minYear; y--) {
      const o1 = document.createElement('option'); o1.value = String(y); o1.textContent = String(y);
      const o2 = document.createElement('option'); o2.value = String(y); o2.textContent = String(y);
      fragFrom.appendChild(o1);
      fragTo.appendChild(o2);
    }
    fromSel.appendChild(fragFrom);
    toSel.appendChild(fragTo);
  }

  

  // UX helpers
  function setOK(msg){ if (statusBad) statusBad.hidden = true; if (statusOK){ statusOK.textContent = msg || 'Thanks — we received your submission.'; statusOK.hidden = false; } }
  function setBad(msg){ if (statusOK) statusOK.hidden = true; if (statusBad){ statusBad.textContent = msg || 'Something’s missing or invalid. Please check highlighted fields.'; statusBad.hidden = false; } }

  function updateCount(){ if (desc && descCount) descCount.textContent = String(desc.value.length); }
  desc?.addEventListener('input', updateCount); updateCount();

  // Basic file validation
  function validatePhotos(){
    photoErr.textContent = '';
    const input = form.querySelector('input[name="photos"]');
    const files = input?.files || [];
    const maxFiles = 1;
    const maxSize = 10 * 1024 * 1024; // 10MB
    const okTypes = new Set(['image/jpeg','image/png']);

    if (!files.length) { photoErr.textContent = 'Please attach at least one image.'; return false; }
   if (files.length > maxFiles) { photoErr.textContent = 'Please attach only one image.'; return false; }

    const bad = [];
    for (const f of files) {
      if (!okTypes.has(f.type)) bad.push(`${f.name} (type)`);
      else if (f.size > maxSize) bad.push(`${f.name} (size)`);
    }
    if (bad.length) {
      photoErr.textContent = `Invalid file(s): ${bad.slice(0,3).join(', ')}${bad.length>3?'…':''}`;
      return false;
    }
    return true;
  }

  // Turnstile helpers (same pattern as other forms)
  function whenTurnstileReady(cb){
    if (window.turnstile && typeof window.turnstile.render === 'function') return cb();
    const t = setInterval(() => {
      if (window.turnstile && typeof window.turnstile.render === 'function') {
        clearInterval(t); cb();
      }
    }, 25);
  }

document.addEventListener('DOMContentLoaded', () => {
  whenTurnstileReady(() => {
    if (captchaWrap) captchaWrap.style.display = 'block';
    if (!widgetId) {
      widgetId = window.turnstile.render('#captcha-wrap', {
        sitekey: SITEKEY,
        theme: 'light',
        callback: (token) => { window.TS_DEBUG = { sitekey: SITEKEY, token, widgetId }; },
        'expired-callback': () => { try { window.turnstile.reset(widgetId); } catch {} },
        'error-callback': () => {}
      });
    }
  });

  // populate the From/To selects once DOM is ready
  populateYearSelects();
});


  async function ensureCaptcha(){
    const hidden = form.querySelector('input[name="cf-turnstile-response"]');
    if (hidden?.value) return hidden.value;
    await new Promise(r => whenTurnstileReady(r));
    for (let i=0;i<10;i++){
      try {
        const t = window.turnstile.getResponse(widgetId);
        if (t) return t;
      } catch {}
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error('Captcha not ready');
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // reset errors
    form.querySelectorAll('.is-error').forEach(el => el.classList.remove('is-error'));
    setOK(''); setBad(''); photoErr.textContent = '';

    let ok = true;

    // required text fields
    ['petName','description'].forEach(name => {
      const input = form.querySelector(`[name="${name}"]`);
      const wrap  = input?.closest('label');
      if (!input || !String(input.value || '').trim()) { wrap?.classList.add('is-error'); ok = false; }
    });

    // email optional but validate if present
    const em = form.querySelector('[name="reporterEmail"]');
    if (em && em.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em.value)) {
      em.closest('label')?.classList.add('is-error'); ok = false;
    }

    // photos
    if (!validatePhotos()) {
      const pWrap = form.querySelector('input[name="photos"]')?.closest('label');
      pWrap?.classList.add('is-error'); ok = false;
    }

    // consents
    ['consentRights','consentPrivacy'].forEach(name => {
      const cb = form.querySelector(`[name="${name}"]`);
      if (!cb?.checked) { cb?.closest('label')?.classList.add('is-error'); ok = false; }
    });

    // honeypot
    const hp = form.querySelector('[name="website"]');
    if (hp && hp.value.trim()) ok = false;

        // year range validation (optional fields)
    const yFrom = form.yearFrom?.value || '';
    const yTo   = form.yearTo?.value || '';
    if (yFrom && yTo && Number(yFrom) > Number(yTo)) {
      form.querySelector('#mem-year-from')?.closest('label')?.classList.add('is-error');
      form.querySelector('#mem-year-to')?.closest('label')?.classList.add('is-error');
      setBad('“From” year cannot be after “To” year.');
      return;
    }


    if (!ok) { setBad(); return; }

    // captcha
    let token = '';
    try { token = await ensureCaptcha(); }
    catch { setBad('Captcha failed. Please try again.'); return; }

    // Build multipart body
    const fd = new FormData();
    fd.set('formType', 'memoriam');          // let the Worker route properly
    fd.set('subjectRaw', 'HFA Submission In Memoriam');
    fd.set('petName', form.petName.value.trim());
    fd.set('species', form.species?.value?.trim() || '');
    fd.set('yearFrom', yFrom);
fd.set('yearTo',   yTo);
// keep a combined string for legacy/back-compat (e.g., “2012–2025” or single year)
const yearsCombined = yFrom && yTo ? `${yFrom}–${yTo}` : (yFrom || yTo || '');
fd.set('years', yearsCombined);

    fd.set('description', form.description.value.trim());
    fd.set('reporterName', form.reporterName?.value?.trim() || '');
    fd.set('reporterEmail', form.reporterEmail?.value?.trim() || '');
    fd.set('handle', form.handle?.value?.trim() || '');
    fd.set('consentRights', String(!!form.consentRights.checked));
    fd.set('consentPrivacy', String(!!form.consentPrivacy.checked));
    fd.set('website', form.website?.value || '');
    fd.set('cf-turnstile-response', token);

    // append files
    const files = form.photos.files;
    for (let i = 0; i < files.length; i++) {
      fd.append('photos', files[i], files[i].name);
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        body: fd       // IMPORTANT: no Content-Type header → browser sets multipart boundary
      });

      let out; try { out = await res.json(); } catch { out = await res.text(); }

      if (res.ok && (out?.ok || res.status === 200)) {
        form.reset();
        updateCount();
        try { if (window.turnstile && widgetId != null) window.turnstile.reset(widgetId); } catch {}
        setOK('Thanks — your submission was received.');
      } else {
        const codes = out?.detail?.['error-codes'] || out?.detail?.error_codes || out?.errors || [];
        const hint  = Array.isArray(codes) && codes.length ? ` (${codes.join(', ')})` : '';
        const mc    = out?.mc_status ? ` [MC ${out.mc_status}]` : '';
        const snip  = (typeof out?.detail === 'string' ? out.detail : '').replace(/\s+/g,' ').slice(0,200);
        setBad(out?.error ? `Send failed: ${out.error}${hint}${mc}${snip ? ' — ' + snip : ''}` : 'Send failed. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setBad('Network error. Please try again.');
    }
  });
})();
// === In Memoriam: build grid from JSON (fully data-driven) ===
async function buildMemoriamPage() {
  const grid = document.getElementById('memoriam-grid');
  if (!grid) return; // not on this page

  // Resolve JSON path relative to current page (dev and prod friendly)
  const base = location.pathname.endsWith('/') ? location.pathname : location.pathname.replace(/[^/]+$/, '/');
const candidates = [
  new URL('assets/data/in-memoriam.json', location.origin + base).href,
  new URL('/assets/data/in-memoriam.json', location.origin).href,
  new URL('data/in-memoriam.json', location.origin + base).href,  // ← add
  new URL('/data/in-memoriam.json', location.origin).href,        // ← add
  new URL('in-memoriam.json', location.origin + base).href,
  new URL('/in-memoriam.json', location.origin).href
];


  let data = null;
  for (const href of candidates) {
    try {
      const r = await fetch(href, { cache: 'no-store' });
      if (r.ok) { data = await r.json(); break; }
    } catch {}
  }
  if (!data) {
    grid.innerHTML = '<p>Couldn’t load memorials.</p>';
    return;
  }

  // Support both flat and sections[0] shapes
  const root = Array.isArray(data.sections) && data.sections.length ? data.sections[0] : data;

  // Title + intro from JSON (optional)
  const h2 = document.getElementById('mem-title');
  const intro = document.getElementById('mem-intro');
  if (h2 && root.title)  h2.textContent = root.title;
  if (intro && root.intro) intro.textContent = root.intro;

  const pets = Array.isArray(root.pets) ? root.pets : [];
  const topHighlight = Number.isFinite(root.topHighlight) ? root.topHighlight : 2;

  // --- Split into featured (first 2) and the rest (randomized) ---
const makeCard = (p) => {
  const card = document.createElement('article');
  card.className = 'memoriam-col';
  card.setAttribute('role', 'listitem');

  if (p.name) {
    const name = document.createElement('div');
    name.className = 'memoriam-name';
    name.textContent = p.name;
    card.appendChild(name);
  }

  const img = document.createElement('img');
  img.className = 'memoriam-img';
  img.loading = 'lazy';
  img.alt = p.name ? p.name : 'Pet';
  img.src = p.img || 'assets/img/placeholder.jpg';
  card.appendChild(img);

  img.addEventListener('load', () => {
    if (img.naturalHeight > img.naturalWidth) img.classList.add('portrait');
  });

  const yearsText = p.years || (p.yearFrom && p.yearTo ? `${p.yearFrom}–${p.yearTo}` : (p.yearFrom || p.yearTo || ''));
  if (yearsText) {
    const years = document.createElement('p');
    years.className = 'years';
    years.textContent = yearsText;
    card.appendChild(years);
  }

  if (p.description) {
    const desc = document.createElement('p');
    desc.textContent = p.description;
    card.appendChild(desc);
  }

  return card;
};

// Featured = first N
const featured = pets.slice(0, topHighlight);
// Rest = everything after, shuffled each load
const rest = pets.slice(topHighlight).sort(() => Math.random() - 0.5);

// Build wrappers
const featuredWrap = document.createElement('div');
featuredWrap.id = 'memoriam-featured';
featuredWrap.className = 'memoriam-featured';

const restWrap = document.createElement('div');
restWrap.id = 'memoriam-rest';
restWrap.className = 'memoriam-rest';

// Fill them
featured.forEach(p => featuredWrap.appendChild(makeCard(p)));
rest.forEach(p => restWrap.appendChild(makeCard(p)));

// Replace the original grid with the two sections
grid.replaceChildren(featuredWrap, restWrap);

// Optional “Add your pet” button under the intro, above the grid (unchanged)
if (root.url) {
  const add = document.createElement('a');
  add.href = root.url;
  add.className = 'action-btn';
  add.textContent = root.buttonText || 'Add your pet';
  add.style.display = 'inline-block';
  add.style.margin = '18px 0 20px';

  const intro = document.getElementById('mem-intro');
  const h2    = document.getElementById('mem-title');

  if (intro)      intro.insertAdjacentElement('afterend', add);
  else if (h2)    h2.insertAdjacentElement('afterend', add);
  else            grid.before(add);
}

}

document.addEventListener('DOMContentLoaded', buildMemoriamPage);
