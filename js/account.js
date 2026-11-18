(() => {
  'use strict';

  const ACCOUNTS_KEY = 'gridline.accounts';
  const SESSION_KEY = 'gridline.session';
  const ITERATIONS = 100000;
  const teams = ['All teams', 'McLaren', 'Ferrari', 'Mercedes', 'Red Bull', 'Aston Martin', 'Alpine', 'Williams', 'Haas', 'Racing Bulls', 'Audi', 'Cadillac'];
  const storageMessage = 'Your browser could not access account storage. Allow local storage and try again.';
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => [...document.querySelectorAll(selector)];

  function readJSON(key, fallback) {
    const stored = localStorage.getItem(key);
    return stored === null ? fallback : JSON.parse(stored);
  }

  function readAccounts() {
    const accounts = readJSON(ACCOUNTS_KEY, []);
    if (!Array.isArray(accounts) || accounts.some((account) => !account ||
      !['id', 'name', 'email', 'phone', 'team', 'createdAt'].every((key) => typeof account[key] === 'string') ||
      typeof account.password?.salt !== 'string' || typeof account.password?.hash !== 'string' || !Array.isArray(account.likes))) {
      throw new Error('Invalid account storage');
    }
    return accounts;
  }

  function saveAccounts(accounts) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function safeUser(account) {
    if (!account) return null;
    const { id, name, email, phone, team, createdAt } = account;
    return { id, name, email, phone, team, createdAt };
  }

  function currentAccount(accounts = readAccounts()) {
    const session = readJSON(SESSION_KEY, null);
    return accounts.find((account) => account.id === session?.userId) || null;
  }

  function getCurrentUser() {
    try { return safeUser(currentAccount()); } catch { return null; }
  }

  function validateEmail(value) {
    return emailPattern.test(value) && value.length <= 254 ? '' : 'Enter a valid email, for example fan@example.com.';
  }

  function validatePassword(value) {
    return value.length >= 8 && value.length <= 128 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /[0-9]/.test(value) && /[^A-Za-z0-9\s]/.test(value)
      ? '' : 'Use 8–128 characters with uppercase, lowercase, a number and a symbol.';
  }

  function validateDetails(data) {
    const name = String(data.name || '').trim();
    const email = String(data.email || '').trim().toLowerCase();
    const phone = String(data.phone || '').trim();
    const team = String(data.team || '');
    const errors = {};
    if (name.length < 2 || name.length > 80) errors.name = 'Enter your name using 2–80 characters.';
    if (validateEmail(email)) errors.email = validateEmail(email);
    const digits = phone.replace(/\D/g, '');
    if (!/^\+?[0-9 ()-]+$/.test(phone) || digits.length < 10 || digits.length > 15) {
      errors.phone = 'Enter a phone number with 10–15 digits, for example +7 701 123 4567.';
    }
    if (!teams.includes(team)) errors.team = 'Please choose a team.';
    return { values: { name, email, phone, team }, errors };
  }

  function bytesToHex(bytes) {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }

  async function passwordHash(password, salt) {
    if (!window.crypto?.subtle) throw new Error('crypto-unavailable');
    const key = await window.crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await window.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: ITERATIONS }, key, 256);
    return bytesToHex(new Uint8Array(bits));
  }

  function operationError(error) {
    return { ok: false, message: error?.message === 'crypto-unavailable'
      ? 'Open this site over HTTPS or localhost to use browser accounts.' : storageMessage };
  }

  function notify(kind) {
    updateUI();
    window.dispatchEvent(new CustomEvent(`gridline:${kind}-changed`, { detail: { user: getCurrentUser(), likes: getLikedDrivers() } }));
  }

  async function register(data) {
    const { values, errors } = validateDetails(data);
    const password = String(data.password || '');
    if (validatePassword(password)) errors.password = validatePassword(password);
    if (data.confirmPassword !== password || !data.confirmPassword) errors.confirmPassword = 'The passwords do not match.';
    if (Object.keys(errors).length) return { ok: false, errors };
    try {
      let accounts = readAccounts();
      if (accounts.some((account) => account.email.toLowerCase() === values.email)) return { ok: false, errors: { email: 'An account with this email already exists. Please log in.' } };
      if (!window.crypto?.subtle) throw new Error('crypto-unavailable');
      const salt = bytesToHex(window.crypto.getRandomValues(new Uint8Array(16)));
      const hash = await passwordHash(password, salt);
      // Re-read after hashing so a second tab's new account is not overwritten.
      accounts = readAccounts();
      if (accounts.some((account) => account.email.toLowerCase() === values.email)) return { ok: false, errors: { email: 'An account with this email already exists. Please log in.' } };
      const account = { ...values, id: window.crypto.randomUUID(), password: { algorithm: 'PBKDF2-SHA256', iterations: ITERATIONS, salt, hash }, likes: [], createdAt: new Date().toISOString() };
      accounts.push(account);
      saveAccounts(accounts);
      return { ok: true, user: safeUser(account) };
    } catch (error) { return operationError(error); }
  }

  async function login(data) {
    const email = String(data.email || '').trim().toLowerCase();
    const password = String(data.password || '');
    const errors = {};
    if (validateEmail(email)) errors.email = validateEmail(email);
    if (validatePassword(password)) errors.password = validatePassword(password);
    if (Object.keys(errors).length) return { ok: false, errors };
    try {
      const account = readAccounts().find((item) => item.email.toLowerCase() === email);
      if (!account?.password?.salt || await passwordHash(password, account.password.salt) !== account.password.hash) {
        return { ok: false, message: 'The email or password is incorrect. Please try again.' };
      }
      localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: account.id }));
      notify('account');
      return { ok: true, user: safeUser(account) };
    } catch (error) { return operationError(error); }
  }

  function logout() {
    try {
      localStorage.removeItem(SESSION_KEY);
      notify('account');
      return { ok: true };
    } catch (error) { return operationError(error); }
  }

  function updateProfile(data) {
    const { values, errors } = validateDetails(data);
    if (Object.keys(errors).length) return { ok: false, errors };
    try {
      const accounts = readAccounts();
      const account = currentAccount(accounts);
      if (!account) return { ok: false, message: 'Please log in to edit your profile.', requiresLogin: true };
      if (accounts.some((item) => item.id !== account.id && item.email.toLowerCase() === values.email)) return { ok: false, errors: { email: 'Another account already uses this email.' } };
      Object.assign(account, values);
      saveAccounts(accounts);
      notify('account');
      return { ok: true, user: safeUser(account), message: 'Your profile has been saved.' };
    } catch (error) { return operationError(error); }
  }

  function getLikedDrivers() {
    try {
      const ids = currentAccount()?.likes;
      const known = new Set((window.GRIDLINE_DRIVERS || []).map((driver) => driver.id));
      return Array.isArray(ids) ? [...new Set(ids.filter((id) => known.has(id)))] : [];
    } catch { return []; }
  }

  function toggleLike(id) {
    if (!(window.GRIDLINE_DRIVERS || []).some((driver) => driver.id === id)) return { ok: false, message: 'This driver could not be found.' };
    try {
      const accounts = readAccounts();
      const account = currentAccount(accounts);
      if (!account) return { ok: false, message: 'Log in to save drivers to your profile.', requiresLogin: true };
      const likes = new Set(getLikedDrivers());
      const liked = !likes.has(id);
      if (liked) likes.add(id); else likes.delete(id);
      account.likes = [...likes];
      saveAccounts(accounts);
      notify('likes');
      return { ok: true, liked, message: liked ? 'Driver added to your profile.' : 'Driver removed from your profile.' };
    } catch (error) { return operationError(error); }
  }

  function setStatus(element, message, isError = false) {
    if (!element) return;
    element.textContent = message;
    element.classList.toggle('account-error', isError);
  }

  function renderLikes() {
    const gallery = $('#profile-likes');
    if (!gallery) return;
    const likedIds = getLikedDrivers();
    gallery.replaceChildren();
    const drivers = (window.GRIDLINE_DRIVERS || []).filter((driver) => likedIds.includes(driver.id));
    $('#profile-likes-empty').hidden = drivers.length > 0;
    $('#profile-likes-count').textContent = `${drivers.length} ${drivers.length === 1 ? 'driver' : 'drivers'} saved`;
    drivers.forEach((driver) => {
      const card = document.createElement('article');
      card.className = 'saved-driver-card';
      const image = document.createElement('img');
      image.src = driver.image;
      image.alt = driver.name;
      image.loading = 'lazy';
      const content = document.createElement('div');
      const heading = document.createElement('h3');
      heading.textContent = driver.name;
      const detail = document.createElement('p');
      detail.textContent = `${driver.team} · ${driver.country}`;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-outline-light';
      remove.textContent = 'Remove like';
      remove.setAttribute('aria-label', `Remove ${driver.name} from liked drivers`);
      remove.addEventListener('click', () => {
        const result = toggleLike(driver.id);
        setStatus($('#profile-likes-status'), result.message, !result.ok);
        if (result.ok) {
          const nextControl = $('#profile-likes button') || $('#profile-find-drivers');
          nextControl?.focus();
        }
      });
      content.append(heading, detail, remove);
      card.append(image, content);
      gallery.append(card);
    });
  }

  let lastProfileSignature = '';
  function updateUI() {
    const user = getCurrentUser();
    $$('[data-account-link]').forEach((link) => {
      link.textContent = 'PROFILE';
      link.href = 'Profile.html';
    });
    const member = $('#profile-member');
    const guest = $('#profile-guest');
    if (member && guest) {
      member.hidden = !user;
      guest.hidden = Boolean(user);
      if (user) {
        $('#profile-display-name').textContent = user.name;
        $('#profile-display-email').textContent = user.email;
        $('#profile-display-phone').textContent = user.phone;
        $('#profile-display-team').textContent = user.team;
        $('#profile-initials').textContent = user.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
        // Liking a driver should not discard unsaved edits in the profile form.
        const signature = JSON.stringify(user);
        if (signature !== lastProfileSignature) {
          ['name', 'email', 'phone', 'team'].forEach((field) => { $(`#profile-${field}`).value = user[field]; });
          lastProfileSignature = signature;
        }
        renderLikes();
      } else lastProfileSignature = '';
    }
  }

  function clearErrors(form) {
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
    form.querySelectorAll('.field-error').forEach((error) => { error.textContent = ''; });
  }

  function showErrors(form, prefix, result) {
    Object.entries(result.errors || {}).forEach(([field, message]) => {
      const control = document.getElementById(`${prefix}-${field}`);
      const error = document.getElementById(`${prefix}-${field}-error`);
      if (control && error) {
        control.setAttribute('aria-invalid', 'true');
        error.textContent = message;
      }
    });
    setStatus($(`#${prefix}-status`), result.message || (result.ok ? '' : 'Please check the highlighted fields.'), !result.ok);
    if (!result.ok) (form.querySelector('[aria-invalid="true"]') || $(`#${prefix}-status`))?.focus();
  }

  function formValues(form) {
    return Object.fromEntries(new FormData(form));
  }

  function bindForm(id, prefix, action, onSuccess) {
    const form = document.getElementById(id);
    if (!form) return;
    let pending = false;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      if (pending) return;
      clearErrors(form);
      const submit = form.querySelector('[type="submit"]');
      const label = submit.textContent;
      pending = true;
      submit.disabled = true;
      submit.textContent = 'Saving…';
      const result = await action(formValues(form));
      pending = false;
      submit.disabled = false;
      submit.textContent = label;
      showErrors(form, prefix, result);
      if (result.ok) onSuccess(result);
    });
  }

  function initialize() {
    bindForm('signup-form', 'signup', register, () => { location.href = 'Login.html?created=1'; });
    bindForm('login-form', 'login', login, () => { location.href = 'Profile.html'; });
    bindForm('profile-form', 'profile', updateProfile, (result) => { setStatus($('#profile-status'), result.message); });
    $('#profile-logout')?.addEventListener('click', () => {
      const result = logout();
      if (result.ok) {
        setStatus($('#profile-guest-status'), 'You have logged out. Your liked drivers are saved for your next visit.');
        $('#profile-login-link')?.focus();
      } else setStatus($('#profile-status'), result.message, true);
    });
    $$('[data-password-toggle]').forEach((button) => {
      button.addEventListener('click', () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const visible = input.type === 'password';
        input.type = visible ? 'text' : 'password';
        button.textContent = visible ? 'Hide password' : 'Show password';
        button.setAttribute('aria-pressed', String(visible));
      });
    });
    if ($('#login-status') && new URLSearchParams(location.search).get('created') === '1') setStatus($('#login-status'), 'Account created. Log in with your new email and password.');
    try { readAccounts(); readJSON(SESSION_KEY, null); } catch {
      setStatus($('#signup-status') || $('#login-status') || $('#profile-guest-status'), storageMessage, true);
    }
    updateUI();
  }

  window.GridlineAccount = { getCurrentUser, getLikedDrivers, toggleLike, updateUI, register, login, logout, updateProfile };
  window.addEventListener('storage', (event) => {
    if ([ACCOUNTS_KEY, SESSION_KEY, null].includes(event.key)) notify(event.key === ACCOUNTS_KEY ? 'likes' : 'account');
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize);
  else initialize();
})();
