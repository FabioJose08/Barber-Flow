// Firebase Web configuration. These values identify the public web app;
// server-side credentials remain exclusively in environment variables.
(function () {
  'use strict';

  const firebaseConfig = {
    apiKey: 'AIzaSyBhwupU1548YFMkRQuIUL9IVOaMM5MasYk',
    authDomain: 'barberflow-a5a19.firebaseapp.com',
    projectId: 'barberflow-a5a19',
    storageBucket: 'barberflow-a5a19.firebasestorage.app',
    messagingSenderId: '228753502894',
    appId: '1:228753502894:web:d5299bd910c24f214df33f',
    measurementId: 'G-4C17MEMXQK'
  };

  if (!window.firebase) {
    console.error('Firebase SDK não foi carregado.');
    return;
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
  }
})();
