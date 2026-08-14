/**
 * Firebase Auth — Google Sign-In (Client-Side)
 *
 * Usa o Firebase Client SDK (compat) carregado via CDN no header.ejs.
 * Fluxo:
 *   1. signInWithPopup(GoogleAuthProvider)
 *   2. Obtém o idToken do usuário autenticado
 *   3. Envia o token via POST para o backend (/auth/google ou /client/auth/google)
 *   4. Backend verifica com admin.auth().verifyIdToken() e cria a sessão
 */

(function () {
  'use strict';

  // Firebase config — mesmo projeto do backend
  const firebaseConfig = {
    apiKey: "AIzaSyBhwupU1548YFMkRQuIUL9IVOaMM5MasYk",
    authDomain: "barberflow-a5a19.firebaseapp.com",
    projectId: "barberflow-a5a19",
    storageBucket: "barberflow-a5a19.firebasestorage.app",
    messagingSenderId: "228753502894",
    appId: "1:228753502894:web:d5299bd910c24f214df33f",
    measurementId: "G-4C17MEMXQK"
  };

  // Inicializa o app Firebase (compat SDK)
  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }

  const provider = new firebase.auth.GoogleAuthProvider();
  // Solicitar seleção de conta a cada login
  provider.setCustomParameters({ prompt: 'select_account' });

  /**
   * Dispara o popup de login com Google e envia o token para o backend.
   * @param {string} endpoint — rota do backend (ex: '/auth/google')
   * @param {HTMLButtonElement} buttonEl — o botão clicado (para feedback visual)
   */
  async function handleGoogleSignIn(endpoint, buttonEl) {
    const originalHTML = buttonEl.innerHTML;

    try {
      // Feedback visual
      buttonEl.disabled = true;
      buttonEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';

      // Abre o popup do Google
      const result = await firebase.auth().signInWithPopup(provider);
      const idToken = await result.user.getIdToken();

      // Envia o token para o backend
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken })
      });

      const data = await response.json();

      if (data.success && data.redirectUrl) {
        window.location.href = data.redirectUrl;
      } else {
        showGoogleError(buttonEl, data.error || 'Erro ao autenticar com Google.');
        buttonEl.innerHTML = originalHTML;
        buttonEl.disabled = false;
      }
    } catch (err) {
      console.error('Google Sign-In error:', err);

      // Não mostra erro se o usuário apenas fechou o popup
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        buttonEl.innerHTML = originalHTML;
        buttonEl.disabled = false;
        return;
      }

      showGoogleError(buttonEl, 'Falha ao conectar com Google. Tente novamente.');
      buttonEl.innerHTML = originalHTML;
      buttonEl.disabled = false;
    }
  }

  /**
   * Mostra uma mensagem de erro temporária abaixo do botão Google.
   */
  function showGoogleError(buttonEl, message) {
    // Remove erro anterior, se existir
    const existing = buttonEl.parentElement.querySelector('.google-auth-error');
    if (existing) existing.remove();

    const errorDiv = document.createElement('div');
    errorDiv.className = 'google-auth-error';
    errorDiv.style.cssText = 'color: #ef4444; font-size: 0.82rem; margin-top: 0.5rem; text-align: center;';
    errorDiv.textContent = message;
    buttonEl.parentElement.appendChild(errorDiv);

    // Remove após 5 segundos
    setTimeout(() => errorDiv.remove(), 5000);
  }

  // Registra event listeners em todos os botões Google da página
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('[data-google-signin]').forEach(function (btn) {
      const endpoint = btn.getAttribute('data-google-signin');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        handleGoogleSignIn(endpoint, btn);
      });
    });
  });
})();
