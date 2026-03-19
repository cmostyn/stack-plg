/* PLG-Hub — client-side password gate */
(function () {
  'use strict';

  const KEY = 'plg_auth';
  if (sessionStorage.getItem(KEY) === '1') return;

  const overlay = document.createElement('div');
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-logo">
        <span class="logo-dot"></span>
        PLG-Hub
      </div>
      <p class="auth-subtitle">StackOne internal dashboard</p>
      <form id="auth-form" class="auth-form" autocomplete="off">
        <input
          type="password"
          id="auth-input"
          class="auth-input"
          placeholder="Password"
          autocomplete="current-password"
        >
        <button type="submit" class="auth-btn">Enter</button>
        <p class="auth-error" id="auth-error"></p>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  // Focus input as soon as it's in the DOM
  document.getElementById('auth-input').focus();

  document.getElementById('auth-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var pw = document.getElementById('auth-input').value;
    if (pw === 'Borris123!') {
      sessionStorage.setItem(KEY, '1');
      overlay.remove();
      // If landing on index (support digests), redirect to dashboard
      var path = window.location.pathname;
      if (path.endsWith('index.html') || path === '/' || path === '') {
        window.location.href = 'dashboard.html';
      }
    } else {
      document.getElementById('auth-error').textContent = 'Wrong password.';
      document.getElementById('auth-input').value = '';
      document.getElementById('auth-input').focus();
    }
  });
})();
