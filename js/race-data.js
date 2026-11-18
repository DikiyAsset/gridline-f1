/* Jolpica supplies scheduled races, not live timing or race results. */
(function () {
  'use strict';

  const SEASON = '2026';
  const API_URL = `https://api.jolpi.ca/ergast/f1/${SEASON}/?limit=100`;
  const CACHE_KEY = `gridline.raceCalendar.${SEASON}.v1`;
  const REQUEST_TIMEOUT = 12000;
  const sessionNames = [
    ['FirstPractice', 'Practice 1'], ['SecondPractice', 'Practice 2'],
    ['ThirdPractice', 'Practice 3'], ['SprintQualifying', 'Sprint qualifying'],
    ['SprintShootout', 'Sprint qualifying'], ['Sprint', 'Sprint'],
    ['Qualifying', 'Qualifying']
  ];

  function validText(value) {
    return typeof value === 'string' && Boolean(value.trim()) && value.length <= 200;
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }

  function validTime(value) {
    return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/.test(value);
  }

  function readSession(value) {
    if (!value || !validDate(value.date)) return null;
    return { date: value.date, time: validTime(value.time) ? value.time : null };
  }

  function normalizeRaces(payload) {
    const raw = payload?.MRData?.RaceTable?.Races;
    if (!Array.isArray(raw) || !raw.length || raw.length > 100) {
      throw new Error('The race calendar response is empty or incomplete.');
    }
    const total = Number(payload.MRData.total);
    if (Number.isFinite(total) && total > raw.length) {
      throw new Error('The race calendar response is incomplete.');
    }
    const rounds = new Set();
    const races = raw.map((race) => {
      const round = Number(race?.round);
      const circuit = race?.Circuit;
      if (race?.season !== SEASON || !Number.isInteger(round) || round < 1 || round > 100 ||
          rounds.has(round) || !validText(race.raceName) || !validDate(race.date) ||
          !validText(circuit?.circuitName) || !validText(circuit?.Location?.country) ||
          race.date.slice(0, 4) !== SEASON) {
        throw new Error('The race calendar response contains invalid data.');
      }
      rounds.add(round);
      const sessions = [];
      const seen = new Set();
      sessionNames.forEach(([key, name]) => {
        const session = readSession(race[key]);
        if (session && !seen.has(name)) {
          sessions.push({ name, ...session });
          seen.add(name);
        }
      });
      sessions.push({ name: 'Grand Prix', date: race.date, time: validTime(race.time) ? race.time : null });
      sessions.sort((a, b) => sessionTimestamp(a) - sessionTimestamp(b));
      return {
        season: SEASON, round, name: race.raceName.trim(),
        circuit: circuit.circuitName.trim(), country: circuit.Location.country.trim(),
        locality: validText(circuit.Location.locality) ? circuit.Location.locality.trim() : '',
        date: race.date, time: validTime(race.time) ? race.time : null, sessions
      };
    });
    return races.sort((a, b) => sessionTimestamp(a) - sessionTimestamp(b));
  }

  // An unknown start time stays eligible through its UTC date; we never invent a time.
  function sessionTimestamp(session) {
    return Date.parse(`${session.date}T${session.time || '23:59:59Z'}`);
  }

  function selectRace(races, now = Date.now()) {
    const upcoming = races.find((race) => sessionTimestamp(race) >= now);
    return { race: upcoming || races[races.length - 1], upcoming: Boolean(upcoming) };
  }

  // Count only toward a confirmed API time. An unknown time must not become midnight.
  function raceCountdown(race, now = Date.now()) {
    if (!validDate(race?.date)) return { state: 'unconfirmed' };
    if (!validTime(race?.time)) {
      return { state: Date.parse(`${race.date}T23:59:59Z`) < now ? 'date-passed' : 'unconfirmed' };
    }
    const remaining = sessionTimestamp(race) - now;
    if (remaining <= 0) return { state: 'passed' };
    const totalMinutes = Math.ceil(remaining / 60000);
    return {
      state: 'upcoming', days: Math.floor(totalMinutes / 1440),
      hours: Math.floor(totalMinutes / 60) % 24, minutes: totalMinutes % 60
    };
  }

  function nextSession(sessions, now = Date.now()) {
    return sessions.find((session) => validTime(session.time) && sessionTimestamp(session) > now) || null;
  }

  async function fetchCalendar(fetchFunction, signal) {
    const response = await fetchFunction(API_URL, { signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`The race service returned ${response.status}.`);
    const payload = await response.json();
    return { payload, races: normalizeRaces(payload) };
  }

  function decodeCache(serialized, now = Date.now()) {
    try {
      const saved = JSON.parse(serialized);
      const timestamp = Date.parse(saved?.savedAt);
      if (!Number.isFinite(timestamp) || timestamp > now + 60000) return null;
      return { payload: saved.payload, races: normalizeRaces(saved.payload), savedAt: saved.savedAt };
    } catch { return null; }
  }

  // Export the data rules for Node's built-in tests without starting browser code.
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { normalizeRaces, selectRace, sessionTimestamp, raceCountdown, nextSession, fetchCalendar, decodeCache, API_URL, CACHE_KEY };
  }
  if (typeof document === 'undefined') return;
  const content = document.getElementById('race-api-content');
  const status = document.getElementById('race-api-status');
  const refresh = document.getElementById('race-refresh');
  if (!content || !status || !refresh) return;

  const dateOnly = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const localDateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  const updatedDateTime = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }

  function formatSession(session) {
    return session.time ? localDateTime.format(new Date(sessionTimestamp(session))) :
      `${dateOnly.format(new Date(`${session.date}T00:00:00Z`))} · Start time to be confirmed`;
  }

  function readCache() {
    // Ignore malformed caches and timestamps from the future.
    try { return decodeCache(localStorage.getItem(CACHE_KEY)); } catch { return null; }
  }

  function writeCache(payload, savedAt) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ payload, savedAt })); return true; }
    catch { return false; }
  }

  function calendarNote(text) {
    const tableSection = document.querySelector('.table-section');
    if (!tableSection) return;
    let note = document.getElementById('calendar-data-status');
    if (!note) {
      note = element('p', '', 'form-note calendar-data-status');
      note.id = 'calendar-data-status';
      tableSection.prepend(note);
    }
    note.textContent = text;
  }

  function renderTable(races, note) {
    const body = document.querySelector('.table-section tbody');
    if (!body) return;
    const rows = races.map((race) => {
      const row = document.createElement('tr');
      const dates = race.sessions.map((session) => session.date).sort();
      const start = dateOnly.format(new Date(`${dates[0]}T00:00:00Z`));
      const end = dateOnly.format(new Date(`${race.date}T00:00:00Z`));
      [
        ['Stage', String(race.round)], ['Grand Prix', race.name],
        ['Circuit', race.circuit], ['Dates', start === end ? end : `${start} – ${end}`]
      ].forEach(([label, text]) => {
        const cell = element('td', text);
        cell.dataset.label = label;
        row.append(cell);
      });
      return row;
    });
    body.replaceChildren(...rows);
    calendarNote(note);
  }

  let countdownTimer = null;
  function render(races, savedAt, cached) {
    if (countdownTimer !== null) clearInterval(countdownTimer);
    const { race, upcoming } = selectRace(races);
    const card = element('article', '', 'race-weekend-card');
    const summary = element('div', '', 'race-weekend-summary');
    const round = element('div', '', 'race-round-heading');
    round.append(element('span', String(race.round).padStart(2, '0'), 'race-round-number'));
    const roundDetails = element('div');
    roundDetails.append(element('p', `ROUND ${race.round} / ${SEASON}`, 'race-round-label'));
    roundDetails.append(element('p', upcoming ? 'Next scheduled race' : 'Final scheduled race of the season', 'race-badge'));
    round.append(roundDetails);
    summary.append(round);
    summary.append(element('h3', race.name));
    summary.append(element('p', race.circuit, 'race-circuit'));
    summary.append(element('p', [race.locality, race.country].filter(Boolean).join(', '), 'race-location'));
    const raceDate = element('time', formatSession(race), 'race-start-date');
    raceDate.dateTime = `${race.date}${race.time ? `T${race.time}` : ''}`;
    summary.append(raceDate);

    const countdown = element('div', '', 'race-countdown');
    countdown.setAttribute('role', 'group');
    const countdownLabel = element('p', '', 'race-countdown-label');
    const values = element('div', '', 'race-countdown-values');
    const counters = ['days', 'hours', 'minutes'].map((unit) => {
      const cell = element('div');
      const number = element('strong', '00');
      cell.append(number, element('span', unit));
      values.append(cell);
      return { unit, number };
    });
    countdown.append(countdownLabel, values);
    summary.append(countdown);

    const sessionsPanel = element('div', '', 'race-sessions-panel');
    const sessionsHeader = element('div', '', 'race-sessions-header');
    sessionsHeader.append(element('h4', 'Weekend sessions'));
    sessionsHeader.append(element('p', 'Times in your local time zone'));
    const schedule = element('ol', '', 'race-session-list');
    const sessionRows = race.sessions.map((session) => {
      const row = element('li', '', 'race-session');
      const heading = element('div', '', 'race-session-heading');
      heading.append(element('span', session.name, 'race-session-name'));
      const badge = element('span', '', 'race-session-status');
      heading.append(badge);
      row.append(heading);
      const time = element('time', formatSession(session));
      time.dateTime = `${session.date}${session.time ? `T${session.time}` : ''}`;
      row.append(time);
      schedule.append(row);
      return { session, row, badge };
    });
    sessionsPanel.append(sessionsHeader, schedule);
    card.append(summary, sessionsPanel);
    content.replaceChildren(card);

    function updateClock() {
      const now = Date.now();
      const clock = raceCountdown(race, now);
      values.hidden = clock.state !== 'upcoming';
      countdownLabel.textContent = clock.state === 'upcoming' ? 'Until the scheduled Grand Prix start' :
        clock.state === 'unconfirmed' ? 'Countdown available when the start time is confirmed' :
          clock.state === 'date-passed' ? 'Scheduled race date has passed. Refresh for the next race.' :
            'Scheduled start time has passed. Refresh for the next race.';
      counters.forEach(({ unit, number }) => { number.textContent = String(clock[unit] || 0).padStart(2, '0'); });
      countdown.setAttribute('aria-label', clock.state === 'upcoming' ?
        `${clock.days} days, ${clock.hours} hours, ${clock.minutes} minutes until the scheduled Grand Prix start` : countdownLabel.textContent);
      const next = nextSession(race.sessions, now);
      sessionRows.forEach(({ session, row, badge }) => {
        const passed = Boolean(session.time && sessionTimestamp(session) <= now);
        row.className = `race-session${session === next ? ' is-next' : ''}${passed ? ' is-past' : ''}${session.name === 'Grand Prix' ? ' is-grand-prix' : ''}`;
        badge.textContent = session === next ? 'Up next' : passed ? 'Scheduled time passed' : '';
        badge.hidden = !badge.textContent;
      });
      if (clock.state !== 'upcoming' && countdownTimer !== null) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
    }
    updateClock();
    if (raceCountdown(race).state === 'upcoming') countdownTimer = setInterval(updateClock, 60000);
    const updated = updatedDateTime.format(new Date(savedAt));
    renderTable(races, `${cached ? 'Saved' : 'Updated'} ${SEASON} calendar from Jolpica F1 · ${updated}. Dates may change.`);
    const reminder = document.getElementById('calendar-snippet');
    if (reminder) reminder.textContent = `${race.name} · ${race.circuit} · ${formatSession(race)}. Check the Schedule page for all session times.`;
  }

  let busy = false;
  let lastSuccessful = null;
  async function load() {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    refresh.textContent = 'Updating…';
    content.setAttribute('aria-busy', 'true');
    status.classList.remove('race-api-error');
    const cache = readCache() || lastSuccessful;
    if (cache) {
      render(cache.races, cache.savedAt, true);
      status.textContent = `Showing a saved calendar from ${updatedDateTime.format(new Date(cache.savedAt))}. Checking for updates…`;
    } else {
      status.textContent = 'Loading the race calendar from Jolpica F1…';
      calendarNote('Published calendar below. Checking Jolpica F1 for updates…');
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
    try {
      const { payload, races } = await fetchCalendar(fetch, controller.signal);
      const savedAt = new Date().toISOString();
      const stored = writeCache(payload, savedAt);
      // Keep the last successful response even when browser storage is blocked.
      lastSuccessful = { payload, races, savedAt };
      render(races, savedAt, false);
      status.textContent = `Calendar updated ${updatedDateTime.format(new Date(savedAt))}. Scheduled sessions, not live timing.${stored ? '' : ' Your browser could not save an offline copy.'}`;
    } catch (error) {
      status.classList.add('race-api-error');
      if (cache) {
        status.textContent = `Could not refresh race data. Showing the saved calendar from ${updatedDateTime.format(new Date(cache.savedAt))}. Check your connection and try again.`;
      } else {
        content.replaceChildren(element('p', 'Session times are temporarily unavailable. The published calendar remains below.', 'race-empty'));
        status.textContent = error?.name === 'AbortError' ? 'The race service took too long to respond. Please try again.' : 'Could not load race data. Check your connection and try again.';
        calendarNote('Published calendar shown below. Automatic updates are currently unavailable.');
      }
    } finally {
      clearTimeout(timeout);
      busy = false;
      refresh.disabled = false;
      refresh.textContent = status.classList.contains('race-api-error') ? 'Try again' : 'Refresh race data';
      content.setAttribute('aria-busy', 'false');
    }
  }

  refresh.addEventListener('click', load);
  load();
})();
