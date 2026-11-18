/* Integrates the real account service with the driver-heart event handlers. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');
const jsPath = path.join(__dirname, '../js');

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { this.data.set(key, String(value)); }
  removeItem(key) { this.data.delete(key); }
}
class Heart {
  constructor(id) {
    this.dataset = { likeDriver: id };
    this.attributes = new Map();
    this.icon = { textContent: '' };
    this.label = { textContent: '' };
    this.listeners = new Map();
  }
  querySelector(selector) { return selector === 'span' ? this.icon : this.label; }
  setAttribute(key, value) { this.attributes.set(key, value); }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  click() { this.listeners.get('click')(); }
}
function boot(storage = new MemoryStorage()) {
  const hearts = [new Heart('norris'), new Heart('leclerc')];
  const handlers = new Map();
  const notifications = [];
  const location = { href: 'Drivers.html' };
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll(selector) { return selector === '[data-like-driver]' ? hearts : []; } };
  const window = {
    crypto: webcrypto,
    GRIDLINE_DRIVERS: [{ id: 'norris', name: 'Lando Norris' }, { id: 'leclerc', name: 'Charles Leclerc' }],
    addEventListener(name, listener) { if (!handlers.has(name)) handlers.set(name, []); handlers.get(name).push(listener); },
    dispatchEvent(event) { (handlers.get(event.type) || []).forEach((handler) => handler(event)); }
  };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const context = vm.createContext({ window, document, location, localStorage: storage, TextEncoder, Uint8Array, CustomEvent, URLSearchParams, showNotification(message) { notifications.push(message); } });
  vm.runInContext(fs.readFileSync(path.join(jsPath, 'account.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(jsPath, 'likes.js'), 'utf8'), context);
  return { hearts, storage, location, notifications, api: window.GridlineAccount };
}
const fan = { name: 'Driver Fan', email: 'fan@example.com', phone: '+7 701 123 4567', team: 'Ferrari', password: 'Racing!2026', confirmPassword: 'Racing!2026' };

(async () => {
  const page = boot();
  assert.equal(page.hearts[0].attributes.get('aria-pressed'), 'false');
  page.hearts[0].click();
  assert.equal(page.location.href, 'Login.html?next=Drivers.html', 'Guest likes lead to login');
  assert.equal((await page.api.register(fan)).ok, true);
  assert.equal((await page.api.login(fan)).ok, true);
  page.hearts[0].click();
  assert.equal(page.hearts[0].icon.textContent, '♥');
  assert.equal(page.hearts[0].label.textContent, 'Liked');
  assert.equal(page.hearts[0].attributes.get('aria-pressed'), 'true');
  assert.equal(page.hearts[0].attributes.get('aria-label'), 'Unlike Lando Norris');
  assert.match(page.notifications.at(-1), /added/);
  const reload = boot(page.storage);
  assert.equal(reload.hearts[0].attributes.get('aria-pressed'), 'true', 'A new page restores saved heart state');
  reload.hearts[0].click();
  assert.equal(reload.hearts[0].icon.textContent, '♡');
  assert.equal(reload.hearts[0].attributes.get('aria-label'), 'Like Lando Norris');
  reload.hearts[1].click();
  assert.deepEqual([...reload.api.getLikedDrivers()], ['leclerc']);
  reload.api.logout();
  assert.equal(reload.hearts[1].attributes.get('aria-pressed'), 'false', 'Logout updates the hearts immediately');
  assert.equal((await reload.api.register({ ...fan, email: 'second@example.com' })).ok, true);
  assert.equal((await reload.api.login({ ...fan, email: 'second@example.com' })).ok, true);
  assert.equal(reload.hearts[1].attributes.get('aria-pressed'), 'false', 'New account never inherits the previous account hearts');
  await reload.api.login(fan);
  assert.equal(reload.hearts[1].attributes.get('aria-pressed'), 'true', 'Logging back in restores only that user hearts');
  console.log('Like integration tests passed: guest login link, account events, heart toggle/labels, notifications, persistence and account isolation.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
