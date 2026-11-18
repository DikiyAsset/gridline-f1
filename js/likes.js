(() => {
  'use strict';
  const api = window.GridlineAccount;
  if (!api) return;
  function updateHearts() {
    const liked = api.getLikedDrivers();
    document.querySelectorAll('[data-like-driver]').forEach((button) => {
      const driver = window.GRIDLINE_DRIVERS.find((item) => item.id === button.dataset.likeDriver);
      const active = liked.includes(button.dataset.likeDriver);
      button.setAttribute('aria-pressed', String(active));
      button.setAttribute('aria-label', `${active ? 'Unlike' : 'Like'} ${driver.name}`);
      button.querySelector('span').textContent = active ? '♥' : '♡';
      button.querySelector('.like-label').textContent = active ? 'Liked' : 'Like';
    });
  }
  document.querySelectorAll('[data-like-driver]').forEach((button) => {
    button.addEventListener('click', () => {
      const result = api.toggleLike(button.dataset.likeDriver);
      if (result.requiresLogin) {
        location.href = 'Login.html?next=Drivers.html';
        return;
      }
      if (result.message && typeof showNotification === 'function') showNotification(result.message);
      api.updateUI();
      updateHearts();
    });
  });
  api.updateUI();
  window.addEventListener('gridline:likes-changed', updateHearts);
  window.addEventListener('gridline:account-changed', updateHearts);
  updateHearts();
})();
