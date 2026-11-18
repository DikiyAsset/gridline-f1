/* Apply before the first paint so navigation does not flash the wrong theme. */
(() => {
  'use strict';
  const storageKey = 'gridline.theme';
  const root = document.documentElement;
  const systemPreference = window.matchMedia('(prefers-color-scheme: dark)');
  let savedTheme = null;
  try { savedTheme = localStorage.getItem(storageKey); } catch { /* Storage may be blocked. */ }

  function applyTheme(theme) {
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    const toggle = document.getElementById('theme-toggle');
    if (toggle) {
      toggle.setAttribute('aria-checked', String(theme === 'dark'));
      toggle.title = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    }
  }

  applyTheme(['light', 'dark'].includes(savedTheme) ? savedTheme : (systemPreference.matches ? 'dark' : 'light'));

  document.addEventListener('DOMContentLoaded', () => {
    applyTheme(root.dataset.theme);
    document.getElementById('theme-toggle')?.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      try { localStorage.setItem(storageKey, next); } catch { /* The toggle still works for this page. */ }
    });
  });

  // Keep open pages in sync when the preference changes in another tab.
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey) {
      applyTheme(['light', 'dark'].includes(event.newValue) ? event.newValue : (systemPreference.matches ? 'dark' : 'light'));
    }
  });
})();
