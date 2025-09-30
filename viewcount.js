(function() {
  const NAMESPACE = 'parallax-bio';
  const ACTION = 'view';
  const KEY = 'main-profile';
  const API_BASE = 'https://counterapi.com/api';
  const countEl = document.getElementById('view-count');
  let currentCount = 0;
  async function hash(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  function genKey() {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < 64; i++) result += chars[Math.floor(Math.random() * chars.length)];
    return result;
  }
  let visitedKey = null, countKey = null, visitedMarker = null;
  async function initKeys() {
    visitedKey = 's_' + (await hash(NAMESPACE + '_visited')).slice(0, 8);
    countKey = 's_' + (await hash(NAMESPACE + '_count')).slice(0, 8);
    visitedMarker = (await hash(NAMESPACE + '_true_marker')).slice(0, 16);
  }
  function setDecoyKeys() {
    [
      ['s_' + genKey().slice(0, 8), genKey().slice(0, 16)],
      ['s_' + genKey().slice(0, 8), genKey().slice(0, 16)],
      ['s_' + genKey().slice(0, 8), genKey().slice(0, 16)],
      ['s_' + genKey().slice(0, 8), btoa(Math.floor(Math.random() * 1000).toString())],
      ['s_' + genKey().slice(0, 8), genKey().slice(0, 12)],
      ['s_' + genKey().slice(0, 8), btoa('42')]
    ].forEach(([key, val]) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, val);
    });
  }
  function hasVisited() { return localStorage.getItem(visitedKey) === visitedMarker; }
  function markAsVisited() { localStorage.setItem(visitedKey, visitedMarker); }
  function getStoredCount() {
    const stored = localStorage.getItem(countKey);
    if (!stored) return null;
    try { return parseInt(atob(stored), 10); } catch { return null; }
  }
  function storeCount(count) { localStorage.setItem(countKey, btoa(count.toString())); }
  function updateDisplay(count) { if (countEl) countEl.textContent = count.toLocaleString(); }
  async function fetchCounter() {
    const url = `${API_BASE}/${NAMESPACE}/${ACTION}/${KEY}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    return data.value || data.count || 0;
  }
  async function init() {
    try {
      await initKeys(); setDecoyKeys();
      if (hasVisited()) {
        const storedCount = getStoredCount();
        if (storedCount !== null) { currentCount = storedCount; updateDisplay(currentCount); }
        else { currentCount = await fetchCounter(); storeCount(currentCount); updateDisplay(currentCount); }
      } else {
        currentCount = await fetchCounter();
        markAsVisited(); storeCount(currentCount); updateDisplay(currentCount);
      }
    } catch (error) { if (countEl) countEl.textContent = '—'; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
