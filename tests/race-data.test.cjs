'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeRaces, selectRace, sessionTimestamp, raceCountdown, nextSession, fetchCalendar, decodeCache, API_URL } = require('../js/race-data.js');

function race(round, date, overrides = {}) {
  return {
    season: '2026', round: String(round), raceName: `Test Grand Prix ${round}`,
    Circuit: { circuitName: 'Test Circuit', Location: { country: 'Test country', locality: 'Test city' } },
    date, time: '14:00:00Z', ...overrides
  };
}
const payload = (races) => ({ MRData: { RaceTable: { season: '2026', Races: races } } });

test('normalizes API schedule and optional sessions in chronological order', () => {
  const result = normalizeRaces(payload([race(2, '2026-04-05'), race(1, '2026-03-08', {
    FirstPractice: { date: '2026-03-06', time: '10:00:00Z' },
    Qualifying: { date: '2026-03-07', time: '14:00:00Z' }
  })]));
  assert.equal(result.length, 2);
  assert.equal(result[0].round, 1);
  assert.equal(result[0].country, 'Test country');
  assert.deepEqual(result[0].sessions.map(({ name }) => name), ['Practice 1', 'Qualifying', 'Grand Prix']);
});

test('rejects empty, malformed, mismatched season and duplicate round responses', () => {
  for (const invalid of [null, {}, payload([]), payload([race(1, '2026-03-08', { season: '2025' })]),
    payload([race(1, '2026-03-08'), race(1, '2026-04-05')]), payload([race(1, '2026-03-08', { Circuit: null })])]) {
    assert.throws(() => normalizeRaces(invalid));
  }
});

test('rejects impossible calendar dates instead of rolling them to the next month', () => {
  assert.throws(() => normalizeRaces(payload([race(1, '2026-02-30')])));
  assert.throws(() => normalizeRaces(payload([race(1, 'not-a-date')])));
});

test('does not invent session times when the API does not provide a valid time', () => {
  const [result] = normalizeRaces(payload([race(1, '2026-03-08', {
    time: '25:00:00Z', FirstPractice: { date: '2026-03-06' }
  })]));
  assert.equal(result.time, null);
  assert.equal(result.sessions[0].time, null);
  assert.equal(sessionTimestamp(result), Date.parse('2026-03-08T23:59:59Z'));
});

test('handles older SprintShootout naming without duplicate session rows', () => {
  const session = { date: '2026-03-07', time: '10:00:00Z' };
  const [result] = normalizeRaces(payload([race(1, '2026-03-08', {
    SprintShootout: session, SprintQualifying: session
  })]));
  assert.equal(result.sessions.filter(({ name }) => name === 'Sprint qualifying').length, 1);
});

test('selects next race by schedule, and final scheduled race after season ends', () => {
  const races = normalizeRaces(payload([race(1, '2026-03-08'), race(2, '2026-04-05')]));
  const next = selectRace(races, Date.parse('2026-03-20T12:00:00Z'));
  assert.equal(next.race.round, 2);
  assert.equal(next.upcoming, true);
  const ended = selectRace(races, Date.parse('2026-12-31T12:00:00Z'));
  assert.equal(ended.race.round, 2);
  assert.equal(ended.upcoming, false);
});

test('an unknown race start time remains eligible on its scheduled UTC date', () => {
  const races = normalizeRaces(payload([race(1, '2026-03-08', { time: undefined })]));
  assert.equal(selectRace(races, Date.parse('2026-03-08T18:00:00Z')).upcoming, true);
});

test('countdown uses the confirmed UTC start and crosses day boundaries correctly', () => {
  const event = { date: '2026-11-22', time: '04:00:00Z' };
  assert.deepEqual(raceCountdown(event, Date.parse('2026-11-21T01:56:00Z')),
    { state: 'upcoming', days: 1, hours: 2, minutes: 4 });
  assert.deepEqual(raceCountdown(event, Date.parse('2026-11-22T03:59:59Z')),
    { state: 'upcoming', days: 0, hours: 0, minutes: 1 });
  assert.deepEqual(raceCountdown(event, Date.parse('2026-11-21T04:00:00Z')),
    { state: 'upcoming', days: 1, hours: 0, minutes: 0 });
});

test('unknown, invalid and already passed start times never produce a fake countdown', () => {
  const before = Date.parse('2026-11-18T10:00:00Z');
  assert.deepEqual(raceCountdown({ date: '2026-11-22', time: null }, before), { state: 'unconfirmed' });
  assert.deepEqual(raceCountdown({ date: '2026-11-22', time: '25:00:00Z' }, before), { state: 'unconfirmed' });
  assert.deepEqual(raceCountdown({ date: '2026-02-30', time: '04:00:00Z' }), { state: 'unconfirmed' });
  assert.deepEqual(raceCountdown({ date: '2026-11-22', time: '04:00:00Z' }, Date.parse('2026-11-22T04:00:00Z')), { state: 'passed' });
  assert.deepEqual(raceCountdown({ date: '2026-11-22', time: '04:00:00Z' }, Date.parse('2026-12-31T04:00:00Z')), { state: 'passed' });
  assert.deepEqual(raceCountdown({ date: '2026-11-22', time: null }, Date.parse('2026-12-31T04:00:00Z')), { state: 'date-passed' });
});

test('up-next session excludes unknown times and moves forward at scheduled boundaries', () => {
  const sessions = [
    { name: 'Practice', date: '2026-11-20', time: null },
    { name: 'Qualifying', date: '2026-11-21', time: '04:00:00Z' },
    { name: 'Grand Prix', date: '2026-11-22', time: '04:00:00Z' }
  ];
  assert.equal(nextSession(sessions, Date.parse('2026-11-20T12:00:00Z')).name, 'Qualifying');
  assert.equal(nextSession(sessions, Date.parse('2026-11-21T04:00:00Z')).name, 'Grand Prix');
  assert.equal(nextSession(sessions, Date.parse('2026-11-22T04:00:00Z')), null);
});

test('fetch uses the documented URL, JSON header and abort signal', async () => {
  const signal = new AbortController().signal;
  const output = await fetchCalendar(async (url, options) => {
    assert.equal(url, API_URL);
    assert.equal(options.signal, signal);
    assert.equal(options.headers.Accept, 'application/json');
    return { ok: true, json: async () => payload([race(1, '2026-03-08')]) };
  }, signal);
  assert.equal(output.races[0].name, 'Test Grand Prix 1');
});

test('fetch failures and invalid JSON/schema are rejected for the inline error path', async () => {
  await assert.rejects(fetchCalendar(async () => ({ ok: false, status: 429 })), /429/);
  await assert.rejects(fetchCalendar(async () => { throw new Error('Offline'); }), /Offline/);
  await assert.rejects(fetchCalendar(async () => ({ ok: true, json: async () => ({}) })), /incomplete/);
  await assert.rejects(fetchCalendar(async () => ({ ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } })), /Invalid JSON/);
});

test('cached schedules keep their timestamp and receive the same schema checks', () => {
  const savedAt = '2026-11-18T10:00:00Z';
  const now = Date.parse('2026-11-18T10:01:00Z');
  const cache = decodeCache(JSON.stringify({ savedAt, payload: payload([race(1, '2026-03-08')]) }), now);
  assert.equal(cache.savedAt, savedAt);
  assert.equal(cache.races.length, 1);
  assert.equal(decodeCache('{bad-json', now), null);
  assert.equal(decodeCache(null, now), null);
  assert.equal(decodeCache(JSON.stringify({ savedAt, payload: payload([]) }), now), null);
  assert.equal(decodeCache(JSON.stringify({ savedAt: '2026-12-18T10:00:00Z', payload: payload([race(1, '2026-03-08')]) }), now), null);
});
