(function(){
  const API = 'https://go.hallieforanimals.org/t';
  const sid = getSID();
  const pid = cryptoRandom();

  const started = now();
  let visibleStart = document.visibilityState === 'visible' ? started : 0;
  let activeMs = 0;

  // initial view
  beacon({ type:'view' });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      visibleStart = now();
    } else if (visibleStart) {
      activeMs += (now() - visibleStart);
      visibleStart = 0;
      beacon({ type:'ping', active_ms: activeMs });
    }
  });

  window.addEventListener('beforeunload', () => {
    if (document.visibilityState === 'visible' && visibleStart){
      activeMs += (now() - visibleStart);
      visibleStart = 0;
    }
    beacon({ type:'ping', active_ms: activeMs });
  });

  // Auto-attach click logging to elements with data-analytics-el
  document.addEventListener('click', (e) => {
    const t = e.target.closest('[data-analytics-el]');
    if (!t) return;
    beacon({ type:'click', channel: 'site', el: t.getAttribute('data-analytics-el') });
  });

  function beacon(partial){
    const payload = {
      ts: Math.floor(Date.now()/1000),
      channel: 'site',
      slug: window.HFA_SLUG || '',     // set per page if you have one
      path: location.pathname,
      ref: document.referrer || '',
      sid, pid,
      ...partial
    };
    try {
      navigator.sendBeacon(API, JSON.stringify(payload));
    } catch {
      fetch(API, { method:'POST', body: JSON.stringify(payload) }).catch(()=>{});
    }
  }

  function now(){ return performance.now(); } // ms within page
  function cryptoRandom(){
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'pid-' + Math.random().toString(36).slice(2);
  }
  function getSID(){
    const k = 'hfa_sid';
    const m = document.cookie.match(new RegExp('(?:^|; )' + k + '=([^;]+)'));
    if (m) return m[1];
    const v = cryptoRandom();
    document.cookie = `${k}=${v}; Max-Age=${60*60*24*180}; Path=/; SameSite=Lax`;
    return v;
  }

  // Accept per-card impressions from the site and send a "view" for that slug
window.addEventListener('hfa-impression', (e) => {
  const slug = (e.detail && e.detail.slug) || '';
  if (!slug) return;
  beacon({ type:'view', channel:'site', slug });
});

})();
