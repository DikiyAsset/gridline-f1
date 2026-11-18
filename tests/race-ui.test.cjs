'use strict';

// Run the real browser module with a small DOM and controlled network/storage.
// The fake DOM deliberately has no innerHTML support: API text must stay text.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/race-data.js'), 'utf8');
const CACHE_KEY = 'gridline.raceCalendar.2026.v1';
const NOW = Date.parse('2026-11-18T10:00:00Z');

class Element {
  constructor(tagName) {
    this.tagName = tagName;
    this.children = [];
    this.attributes = new Map();
    this.listeners = new Map();
    this.dataset = {};
    this.className = '';
    this.disabled = false;
    this._text = '';
    this.classList = {
      add: (value) => { if (!this.classList.contains(value)) this.className = `${this.className} ${value}`.trim(); },
      remove: (value) => { this.className = this.className.split(/\s+/).filter((entry) => entry !== value).join(' '); },
      contains: (value) => this.className.split(/\s+/).includes(value)
    };
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => child.textContent).join(''); }
  set innerHTML(_) { throw new Error('Unsafe innerHTML use'); }
  append(...nodes) { this.children.push(...nodes); }
  prepend(...nodes) { this.children.unshift(...nodes); }
  replaceChildren(...nodes) { this._text = ''; this.children = [...nodes]; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  click() { if (!this.disabled) return this.listeners.get('click')?.(); }
}

function fixturePayload(name = 'Las Vegas Grand Prix') {
  return {
    MRData: { total: '1', RaceTable: { season: '2026', Races: [{
      season: '2026', round: '21', raceName: name, date: '2026-11-22', time: '04:00:00Z',
      Circuit: { circuitName: 'Las Vegas Strip Circuit', Location: { country: 'USA', locality: 'Las Vegas' } },
      FirstPractice: { date: '2026-11-20', time: '00:30:00Z' },
      Qualifying: { date: '2026-11-21', time: '04:00:00Z' }
    }] } }
  };
}

const ok = (data = fixturePayload()) => ({ ok: true, status: 200, json: async () => data });
const flush = () => new Promise((resolve) => setImmediate(resolve));

function createPage({ fetchResponse, cache, blockedStorage = false, missingMarkup = false } = {}) {
  const root = new Element('body');
  const make = (tagName, id) => {
    const node = new Element(tagName);
    node.id = id;
    return node;
  };
  const content = make('div', 'race-api-content');
  const status = make('p', 'race-api-status');
  const refresh = make('button', 'race-refresh');
  const reminder = make('p', 'calendar-snippet');
  const tableSection = make('section', 'static-calendar');
  const tbody = new Element('tbody');
  const publishedRow = new Element('tr');
  publishedRow.textContent = 'Original published calendar';
  tbody.append(publishedRow);
  tableSection.append(tbody);
  if (!missingMarkup) root.append(content, status, refresh, reminder, tableSection);
  const find = (parent, id) => parent.id === id ? parent : parent.children.map((child) => find(child, id)).find(Boolean);
  const document = {
    createElement: (tag) => new Element(tag),
    getElementById: (id) => find(root, id) || null,
    querySelector: (selector) => selector === '.table-section' ? tableSection :
      selector === '.table-section tbody' ? tbody : null
  };
  const storage = new Map(cache ? [[CACHE_KEY, JSON.stringify(cache)]] : []);
  const localStorage = {
    getItem(key) { if (blockedStorage) throw new Error('Storage blocked'); return storage.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw new Error('Storage blocked'); storage.set(key, String(value)); }
  };
  const requests = [];
  const timers = new Map();
  let nextTimer = 0;
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [NOW])); }
    static now() { return NOW; }
  }
  vm.runInNewContext(source, {
    document, localStorage, Date: FixedDate, Intl, AbortController,
    fetch: (url, options) => {
      requests.push({ url, options });
      return fetchResponse(requests.length, url, options);
    },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  }, { filename: 'race-data.js' });
  return { document, content, status, refresh, reminder, tbody, publishedRow, storage, requests, timers };
}

test('shows loading state and keeps the published calendar until a real response succeeds', async () => {
  let resolveFetch;
  const page = createPage({ fetchResponse: () => new Promise((resolve) => { resolveFetch = resolve; }) });
  assert.match(page.status.textContent, /Loading the race calendar/);
  assert.equal(page.refresh.disabled, true);
  assert.equal(page.content.getAttribute('aria-busy'), 'true');
  assert.equal(page.tbody.children[0], page.publishedRow);
  assert.equal(page.requests.length, 1);
  page.refresh.click();
  assert.equal(page.requests.length, 1, 'disabled refresh does not start a second request');

  resolveFetch(ok());
  await flush();
  assert.match(page.status.textContent, /Calendar updated/);
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
  assert.match(page.content.textContent, /Practice 1/);
  assert.match(page.content.textContent, /Next scheduled race/);
  assert.notEqual(page.tbody.children[0], page.publishedRow);
  assert.equal(page.tbody.children[0].children.length, 4);
  assert.equal(page.refresh.disabled, false);
  assert.equal(page.content.getAttribute('aria-busy'), 'false');
  assert.match(page.reminder.textContent, /Las Vegas Grand Prix/);
  assert.equal(JSON.parse(page.storage.get(CACHE_KEY)).savedAt, '2026-11-18T10:00:00.000Z');
  assert.equal(page.timers.size, 0, 'successful request clears its timeout');
});

test('first-load failure shows inline error and retry without replacing the static table', async () => {
  const page = createPage({ fetchResponse: async (attempt) => {
    if (attempt === 1) throw new TypeError('Offline');
    return ok();
  } });
  await flush();
  assert.match(page.status.textContent, /Could not load race data/);
  assert.equal(page.status.classList.contains('race-api-error'), true);
  assert.match(page.content.textContent, /Session times are temporarily unavailable/);
  assert.equal(page.refresh.disabled, false);
  assert.equal(page.refresh.textContent, 'Try again');
  assert.equal(page.content.getAttribute('aria-busy'), 'false');
  assert.equal(page.tbody.children[0], page.publishedRow);
  assert.match(page.document.getElementById('calendar-data-status').textContent, /Published calendar shown below/);
  assert.equal(page.storage.size, 0);

  await page.refresh.click();
  assert.equal(page.requests.length, 2);
  assert.match(page.status.textContent, /Calendar updated/);
  assert.equal(page.status.classList.contains('race-api-error'), false);
  assert.equal(page.refresh.textContent, 'Refresh race data');
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
});

test('offline cache stays visible with its saved date and is never described as freshly updated', async () => {
  const savedAt = '2026-11-17T10:00:00Z';
  const page = createPage({ cache: { savedAt, payload: fixturePayload() }, fetchResponse: async () => { throw new TypeError('Offline'); } });
  assert.match(page.status.textContent, /Showing a saved calendar from 17 Nov 2026/);
  assert.match(page.status.textContent, /Checking for updates/);
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
  await flush();
  assert.match(page.status.textContent, /Could not refresh race data/);
  assert.match(page.status.textContent, /saved calendar from 17 Nov 2026/);
  assert.doesNotMatch(page.status.textContent, /^Calendar updated/);
  assert.match(page.document.getElementById('calendar-data-status').textContent, /^Saved 2026 calendar/);
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
  assert.equal(page.refresh.disabled, false);
  assert.equal(page.refresh.textContent, 'Try again');
});

test('blocked localStorage still renders API data and preserves it if refresh later fails', async () => {
  const page = createPage({ blockedStorage: true, fetchResponse: async (attempt) => {
    if (attempt > 1) throw new TypeError('Offline');
    return ok();
  } });
  await flush();
  assert.match(page.status.textContent, /Calendar updated/);
  assert.match(page.status.textContent, /could not save an offline copy/);
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
  await page.refresh.click();
  assert.match(page.status.textContent, /Showing the saved calendar/);
  assert.match(page.content.textContent, /Las Vegas Grand Prix/);
  assert.equal(page.refresh.disabled, false);
});

test('malformed API data takes the error path and cannot replace the published calendar', async () => {
  const page = createPage({ fetchResponse: async () => ok({ MRData: { RaceTable: { Races: [] } } }) });
  await flush();
  assert.match(page.status.textContent, /Could not load race data/);
  assert.equal(page.refresh.disabled, false);
  assert.equal(page.tbody.children[0], page.publishedRow);
  assert.equal(page.storage.size, 0);
});

test('timeout aborts the fetch and restores a usable retry button with an inline timeout message', async () => {
  const page = createPage({ fetchResponse: (_, __, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' })));
  }) });
  const timeout = [...page.timers.values()][0];
  assert.equal(timeout.delay, 12000);
  timeout.callback();
  await flush();
  assert.equal(page.requests[0].options.signal.aborted, true);
  assert.match(page.status.textContent, /took too long to respond/);
  assert.equal(page.refresh.disabled, false);
  assert.equal(page.refresh.textContent, 'Try again');
  assert.equal(page.content.getAttribute('aria-busy'), 'false');
  assert.equal(page.tbody.children[0], page.publishedRow);
});

test('API labels are rendered as text and the module is harmless on pages without its markup', async () => {
  const label = '<img src=x onerror=alert(1)> Grand Prix';
  const page = createPage({ fetchResponse: async () => ok(fixturePayload(label)) });
  await flush();
  assert.match(page.content.textContent, /<img src=x onerror=alert\(1\)> Grand Prix/);
  assert.match(page.status.textContent, /Calendar updated/);
  const absent = createPage({ missingMarkup: true, fetchResponse: () => { throw new Error('Must not fetch'); } });
  assert.equal(absent.requests.length, 0);
  assert.equal(absent.timers.size, 0);
});
