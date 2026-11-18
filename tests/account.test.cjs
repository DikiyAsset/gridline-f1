/* Service-level tests: validation, hashed credentials, persistence and isolated likes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const { TextEncoder } = require('node:util');

const source = fs.readFileSync(path.join(__dirname, '../js/account.js'), 'utf8');
class MemoryStorage {
  constructor() { this.values = new Map(); }
  getItem(key) { return this.values.get(key) ?? null; }
  setItem(key, value) { this.values.set(key, String(value)); }
  removeItem(key) { this.values.delete(key); }
}
function boot(storage = new MemoryStorage(), crypto = webcrypto) {
  const events = [];
  const window = { crypto, GRIDLINE_DRIVERS: [{ id: 'norris' }, { id: 'leclerc' }], addEventListener() {}, dispatchEvent(event) { events.push(event.type); } };
  const document = { readyState: 'loading', addEventListener() {}, querySelector() { return null; }, querySelectorAll() { return []; } };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options?.detail; } }
  const context = vm.createContext({ window, document, localStorage: storage, TextEncoder, Uint8Array, CustomEvent, URLSearchParams });
  vm.runInContext(source, context);
  return { api: window.GridlineAccount, storage, events };
}
const alice = { name: 'Alice Fan', email: 'ALICE@EXAMPLE.COM', phone: '+7 701 123 4567', team: 'Ferrari', password: 'Racing!2026', confirmPassword: 'Racing!2026' };
const bob = { ...alice, name: 'Bob Fan', email: 'bob@example.com', team: 'McLaren' };

(async () => {
  const { api, storage, events } = boot();
  let result = await api.register({ name: '', email: 'wrong', phone: 'abc', team: 'Fake', password: 'short', confirmPassword: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(Object.keys(result.errors).sort(), ['confirmPassword', 'email', 'name', 'password', 'phone', 'team']);
  assert.equal(storage.getItem('gridline.accounts'), null, 'Invalid signup never writes an account');

  result = await api.register(alice);
  assert.equal(result.ok, true);
  assert.equal(result.user.email, 'alice@example.com');
  assert.equal('password' in result.user, false, 'Public user object excludes password');
  const raw = storage.getItem('gridline.accounts');
  assert.equal(raw.includes(alice.password), false, 'Plain password is not stored');
  const stored = JSON.parse(raw)[0];
  assert.equal(stored.password.hash.length, 64);
  assert.equal(stored.password.salt.length, 32);
  assert.equal(api.getCurrentUser(), null, 'Signup requires a separate login');

  result = await api.register({ ...alice, email: 'alice@example.com' });
  assert.equal(result.ok, false);
  assert.match(result.errors.email, /already exists/);
  result = await api.login({ email: alice.email, password: 'Different!2026' });
  assert.equal(result.ok, false);
  assert.equal(api.getCurrentUser(), null);
  result = await api.login({ email: ' alice@example.com ', password: alice.password });
  assert.equal(result.ok, true);
  assert.equal(api.getCurrentUser().name, alice.name);
  assert.equal(boot(storage).api.getCurrentUser().email, 'alice@example.com', 'Session survives another page load');

  assert.equal(api.toggleLike('norris').liked, true);
  assert.deepEqual([...api.getLikedDrivers()], ['norris']);
  assert.equal(boot(storage).api.getLikedDrivers()[0], 'norris', 'Likes persist across page loads');
  assert.equal(api.toggleLike('unknown').ok, false);
  assert.equal(api.logout().ok, true);
  assert.equal(api.toggleLike('leclerc').requiresLogin, true);

  assert.equal((await api.register(bob)).ok, true);
  assert.equal((await api.login({ email: bob.email, password: bob.password })).ok, true);
  assert.deepEqual([...api.getLikedDrivers()], [], 'Second account starts with separate likes');
  assert.equal(api.toggleLike('leclerc').ok, true);
  assert.equal(api.updateProfile({ ...bob, email: 'alice@example.com' }).ok, false, 'Duplicate profile email is rejected');
  result = api.updateProfile({ ...bob, name: 'Bob Updated', phone: '000', email: bob.email });
  assert.equal(result.ok, false);
  assert.match(result.errors.phone, /10–15/);
  result = api.updateProfile({ ...bob, name: 'Bob Updated' });
  assert.equal(result.ok, true);
  assert.equal(api.getCurrentUser().name, 'Bob Updated');
  api.logout();
  await api.login({ email: alice.email, password: alice.password });
  assert.deepEqual([...api.getLikedDrivers()], ['norris'], 'Alice retains her own likes');
  assert.equal(api.toggleLike('norris').liked, false);
  assert.deepEqual([...api.getLikedDrivers()], []);
  assert.ok(events.includes('gridline:account-changed'));
  assert.ok(events.includes('gridline:likes-changed'));

  const corrupt = new MemoryStorage();
  corrupt.setItem('gridline.accounts', '{broken');
  assert.equal((await boot(corrupt).api.register(alice)).ok, false);
  assert.equal(corrupt.getItem('gridline.accounts'), '{broken', 'Corrupt storage is not overwritten');
  corrupt.setItem('gridline.accounts', '[{"id":"bad","email":"bad@example.com"}]');
  assert.equal(boot(corrupt).api.getCurrentUser(), null, 'Incomplete data never becomes a logged-in account');
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } };
  assert.match((await boot(blocked).api.register(alice)).message, /storage/);
  assert.match((await boot(new MemoryStorage(), {}).api.register(alice)).message, /HTTPS or localhost/);
  console.log('Account tests passed: custom validation, salted hashes, login, persistence, edits, isolated likes, logout and storage failures.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
