(function() {
  const NAMESPACE = 'parallax-bio';
  const ACTION = 'view';
  const KEY = 'main-profile';
  const API_BASE = 'https://counterapi.com/api';
  const VISITED_KEY = 'parallax_visited';
  const countEl = document.getElementById('view-count');
  let currentCount = 0;

  function getBrowserFingerprint() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Browser fingerprint session', 2, 2);
    
    const sessionData = {
      ua: navigator.userAgent,
      lang: navigator.language,
      langs: navigator.languages ? navigator.languages.join(',') : '',
      platform: navigator.platform,
      cookieEnabled: navigator.cookieEnabled,
      doNotTrack: navigator.doNotTrack,
      screen: `${screen.width}x${screen.height}x${screen.colorDepth}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      canvas: canvas.toDataURL(),
      localStorage: typeof(Storage) !== "undefined",
      sessionStorage: typeof(sessionStorage) !== "undefined",
      webgl: (() => {
        try {
          const gl = canvas.getContext('webgl');
          return gl ? gl.getParameter(gl.RENDERER) : 'none';
        } catch(e) { return 'error'; }
      })(),
      plugins: Array.from(navigator.plugins || []).map(p => p.name).sort().join(','),
      mimeTypes: Array.from(navigator.mimeTypes || []).map(m => m.type).sort().join(',')
    };
    
    return btoa(JSON.stringify(sessionData)).slice(0, 64);
  }

  function hasVisited() {
    return localStorage.getItem(VISITED_KEY) === getBrowserFingerprint();
  }

  function markAsVisited() {
    localStorage.setItem(VISITED_KEY, getBrowserFingerprint());
  }

  function updateDisplay(count) {
    if (countEl) countEl.textContent = count.toLocaleString();
  }

  async function fetchCounter() {
    const url = `${API_BASE}/${NAMESPACE}/${ACTION}/${KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.value || data.count || 0;
  }

  async function init() {
    try {
      currentCount = await fetchCounter();
      updateDisplay(currentCount);

      if (!hasVisited()) {
        markAsVisited();
      }
      
      setInterval(async () => {
        try {
          currentCount = await fetchCounter();
          updateDisplay(currentCount);
        } catch (error) {
          console.log('Failed to update counter');
        }
      }, 30000);
      
    } catch (error) {
      if (countEl) countEl.textContent = '—';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
