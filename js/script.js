'use strict';

const select = (selector, parent = document) => parent.querySelector(selector);
const selectAll = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function readSaved(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}

function saveLocally(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch { return false; }
}

let notificationTimer;
function showNotification(message) {
  const notification = select('#site-notification');
  if (!notification) return;
  (select('dialog[open]') || document.body).append(notification);
  notification.textContent = message;
  notification.classList.add('is-visible');
  clearTimeout(notificationTimer);
  notificationTimer = setTimeout(() => notification.classList.remove('is-visible'), 3000);
}

function fieldError(id, message) {
  const input = document.getElementById(id);
  const error = document.getElementById(`${id}-error`);
  input.setAttribute('aria-invalid', String(Boolean(message)));
  error.textContent = message;
  return !message;
}

function initializeImages() {
  const images = selectAll('img[data-src]');
  const load = (image) => {
    image.src = image.dataset.src;
    delete image.dataset.src;
  };
  // Carousel slides and search results can be hidden; load those eagerly.
  if (!('IntersectionObserver' in window)) return images.forEach(load);
  const observer = new IntersectionObserver((entries) => {
    entries.filter((entry) => entry.isIntersecting).forEach((entry) => {
      load(entry.target);
      observer.unobserve(entry.target);
    });
  }, { rootMargin: '200px' });
  images.forEach((image) => {
    if (image.closest('.carousel, .gallery')) load(image);
    else observer.observe(image);
  });
}

function initializeDriverSearch() {
  const input = select('#driver-search');
  if (!input) return;
  const cards = selectAll('.gallery-item');
  const suggestions = select('#driver-suggestions');
  const captions = selectAll('.gallery-item figcaption h3, .gallery-item figcaption p');
  const originals = new Map(captions.map((caption) => [caption, caption.textContent]));
  const options = [...new Set([...originals.values()].flatMap((text) => text.split(' · ')))];

  function filterDrivers() {
    const query = input.value.trim().toLowerCase();
    saveLocally('gridline.driverSearch', input.value);
    const likedOnly = select('#liked-filter')?.getAttribute('aria-pressed') === 'true';
    const likedIds = window.GridlineAccount?.getLikedDrivers() || [];
    let visible = 0;
    cards.forEach((card) => {
      card.hidden = !select('figcaption', card).textContent.toLowerCase().includes(query) || (likedOnly && !likedIds.includes(card.dataset.driverId));
      if (!card.hidden) visible++;
    });
    // Build highlights as text nodes so search input cannot become executable HTML.
    originals.forEach((text, caption) => {
      caption.replaceChildren();
      let position = 0;
      let match = query ? text.toLowerCase().indexOf(query) : -1;
      while (match !== -1) {
        caption.append(document.createTextNode(text.slice(position, match)));
        const mark = document.createElement('mark');
        mark.textContent = text.slice(match, match + query.length);
        caption.append(mark);
        position = match + query.length;
        match = text.toLowerCase().indexOf(query, position);
      }
      caption.append(document.createTextNode(text.slice(position)));
    });
    suggestions.replaceChildren();
    if (query) options.filter((value) => value.toLowerCase().includes(query)).slice(0, 6).forEach((value) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value;
      button.addEventListener('click', () => {
        input.value = value;
        filterDrivers();
        suggestions.hidden = true;
        input.focus();
      });
      suggestions.append(button);
    });
    suggestions.hidden = !suggestions.childElementCount;
    select('.gallery').classList.toggle('search-active', Boolean(query));
    select('#driver-search-status').textContent = visible ? `${visible} drivers found` : 'No drivers found. Try another driver or team.';
  }

  input.value = new URLSearchParams(location.search).get('team') ?? (readSaved('gridline.driverSearch') || '');
  input.addEventListener('input', filterDrivers);
  select('#liked-filter')?.addEventListener('click', (event) => {
    const button = event.currentTarget;
    button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true'));
    filterDrivers();
  });
  select('#search-clear')?.addEventListener('click', () => {
    input.value = '';
    select('#liked-filter')?.setAttribute('aria-pressed', 'false');
    filterDrivers();
    input.focus();
  });
  window.addEventListener('gridline:likes-changed', filterDrivers);
  window.addEventListener('gridline:account-changed', filterDrivers);
  input.addEventListener('keydown', (event) => { if (event.key === 'Escape') suggestions.hidden = true; });
  document.addEventListener('click', (event) => { if (!event.target.closest('.search-box')) suggestions.hidden = true; });
  filterDrivers();
  suggestions.hidden = true;
}

function initializeDisclosures() {
  selectAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      const answer = document.getElementById(button.getAttribute('aria-controls'));
      button.setAttribute('aria-expanded', String(open));
      answer.inert = !open;
      answer.classList.toggle('is-open', open);
      select('span', button).textContent = open ? '−' : '+';
    });
  });
}

function initializePreferences() {
  const dialog = select('#subscribe-dialog');
  if (!dialog) return;
  const form = select('#subscribe-form');
  const input = select('#subscribe-email');
  const error = select('#subscribe-error');
  const team = select('#preference-team');
  const status = select('#subscribe-status');
  select('#subscribe-open').addEventListener('click', () => {
    const saved = readSaved('gridline.preferences');
    input.value = typeof saved?.email === 'string' ? saved.email : '';
    team.value = saved?.team || 'all';
    if (!team.value) team.value = 'all';
    input.removeAttribute('aria-invalid');
    error.textContent = '';
    status.textContent = '';
    dialog.showModal();
  });
  select('#subscribe-close').addEventListener('click', () => {
    dialog.close();
    select('#subscribe-open').focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const valid = emailPattern.test(input.value.trim());
    error.textContent = valid ? '' : 'Enter an email address such as fan@example.com.';
    input.setAttribute('aria-invalid', String(!valid));
    status.textContent = '';
    if (!valid) return input.focus();
    const saved = saveLocally('gridline.preferences', { email: input.value.trim(), team: team.value });
    status.textContent = saved ? 'Race preferences saved on this device. No email subscription was created.' : 'Your browser could not save preferences. Please allow local storage and try again.';
    if (saved) showNotification('Race preferences saved.');
  });
}

function initializeContactForm() {
  const form = select('#contact-form');
  if (!form) return;
  const saved = readSaved('gridline.contactDraft');
  ['name', 'email', 'phone', 'team', 'message'].forEach((id) => {
    if (typeof saved?.[id] === 'string') document.getElementById(id).value = saved[id];
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = select('#name').value.trim();
    const email = select('#email').value.trim();
    const message = select('#message').value.trim();
    const phone = select('#phone').value.trim();
    const phoneValid = /^\+?[0-9 ()-]+$/.test(phone) && phone.replace(/\D/g, '').length >= 7 && phone.replace(/\D/g, '').length <= 15;
    const valid = [
      fieldError('name', name ? '' : 'Please enter your name.'),
      fieldError('email', emailPattern.test(email) ? '' : 'Enter an email address such as fan@example.com.'),
      fieldError('phone', phoneValid ? '' : 'Enter a phone number with 7–15 digits, for example +7 700 123 4567.'),
      fieldError('message', message ? '' : 'Please write your F1 question or idea.')
    ].every(Boolean);
    select('#contact-status').textContent = '';
    if (!valid) return select('[aria-invalid="true"]', form).focus();
    const stored = saveLocally('gridline.contactDraft', { name, email, phone, message, team: select('#team').value });
    select('#contact-status').textContent = stored ? 'Draft saved on this device. No message has been sent.' : 'Could not save your draft. Please allow local storage and try again.';
    if (stored) showNotification('Your F1 message draft is saved.');
  });
}

function initializeCopyButtons() {
  selectAll('.copy-button').forEach((button) => button.addEventListener('click', async () => {
    const text = select(button.dataset.copyTarget).textContent;
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch {
      const fallback = document.createElement('textarea');
      fallback.value = text;
      fallback.style.cssText = 'position:fixed;opacity:0';
      document.body.append(fallback);
      fallback.select();
      try { copied = document.execCommand('copy'); } catch { /* Show the manual copy hint below. */ }
      fallback.remove();
      button.focus();
    }
    const tooltip = select('.copy-tooltip', button);
    tooltip.textContent = copied ? 'Copied to clipboard!' : 'Select the reminder text and copy it manually.';
    tooltip.hidden = false;
    clearTimeout(button.copyTimer);
    button.copyTimer = setTimeout(() => tooltip.hidden = true, 2500);
  }));
}

function initializeProgress() {
  const progress = select('#scroll-progress');
  if (!progress) return;
  function update() {
    const range = document.documentElement.scrollHeight - innerHeight;
    const percent = range > 0 ? Math.max(0, Math.min(100, scrollY / range * 100)) : 0;
    progress.setAttribute('aria-valuenow', String(Math.round(percent)));
    select('span', progress).style.width = `${percent}%`;
  }
  window.addEventListener('scroll', update, { passive: true });
  window.addEventListener('resize', update);
  window.addEventListener('load', update);
  update();
}

initializeImages();
initializeDriverSearch();
initializeDisclosures();
initializePreferences();
initializeContactForm();
initializeCopyButtons();
initializeProgress();
if (reducedMotion.matches) selectAll('video[autoplay]').forEach((video) => video.pause());
