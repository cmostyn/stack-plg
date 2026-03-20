/* CS-Hub — client-side password gate */
(function () {
  'use strict';

  var KEY = 'plg_auth';

  // Hide the page immediately to prevent flash before auth resolves
  document.documentElement.style.opacity = '0';

  function init() {
    document.documentElement.style.opacity = '';

    if (sessionStorage.getItem(KEY) === '1') return;

    var overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.innerHTML = [
      '<div class="auth-card">',
        '<div class="auth-logo"><span class="logo-dot"></span>CS-Hub</div>',
        '<p class="auth-subtitle">StackOne internal dashboard</p>',
        '<form id="auth-form" class="auth-form" autocomplete="off">',
          '<input type="password" id="auth-input" class="auth-input" placeholder="Password" autocomplete="current-password">',
          '<button type="submit" class="auth-btn">Enter</button>',
          '<p class="auth-error" id="auth-error"></p>',
        '</form>',
      '</div>',
    ].join('');

    document.body.appendChild(overlay);
    document.getElementById('auth-input').focus();

    document.getElementById('auth-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var pw = document.getElementById('auth-input').value;
      if (pw === 'Borris123!') {
        sessionStorage.setItem(KEY, '1');
        overlay.remove();
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
