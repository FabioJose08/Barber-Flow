const express = require('express');
const router = express.Router();
const { createUser, findUserByEmail } = require('../database/repository');
const { admin } = require('../database/firebase');
const { redirectIfAuthenticated } = require('../middleware/auth');

/**
 * Cria uma sessão de usuário e retorna JSON com a URL de redirecionamento.
 * Usada pelas rotas de Google Sign-In (chamadas via fetch/AJAX).
 */
function createSessionJSON(req, res, user, redirectUrl) {
  req.session.regenerate((err) => {
    if (err) {
      console.error('Error regenerating session:', err);
      return res.status(500).json({ success: false, error: 'Erro interno de autenticação.' });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'cliente',
      phone: user.phone || null
    };

    res.json({ success: true, redirectUrl });
  });
}

// GET / - Redirect to correct dashboard based on role if logged in, otherwise to login
router.get('/', (req, res) => {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'cliente') {
      res.redirect('/client/dashboard');
    } else {
      res.redirect('/dashboard');
    }
  } else {
    res.redirect('/login');
  }
});

// ==========================================
// BARBER AUTHENTICATION ROTAS
// ==========================================

// GET /register - Redirect to login (Google only)
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.redirect('/login');
});

// GET /login - Render login page for barbers (Google Sign-In only)
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { error: null, success: null });
});



// ==========================================
// GOOGLE SIGN-IN — BARBEIRO
// ==========================================

// POST /auth/google - Verify Google ID token and create/find barber user
router.post('/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, error: 'Token não fornecido.' });
    }

    if (!admin) {
      return res.status(503).json({ success: false, error: 'Firebase não configurado. Google Sign-In indisponível.' });
    }

    // Verify the Google ID token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    const name = decodedToken.name || email.split('@')[0];

    if (!email) {
      return res.status(400).json({ success: false, error: 'Conta Google sem e-mail válido.' });
    }

    // Check if user already exists
    let user = await findUserByEmail(email);

    if (user) {
      // User exists — log them in with their existing role
      createSessionJSON(req, res, user, user.role === 'cliente' ? '/client/dashboard' : '/dashboard');
    } else {
      // New user — create as barbeiro (came from barber login page)
      user = await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: null, // Google users don't have a password
        role: 'barbeiro',
        auth_provider: 'google',
        google_uid: decodedToken.uid
      });

      createSessionJSON(req, res, user, '/dashboard');
    }
  } catch (err) {
    console.error('Error during Google Sign-In (barber):', err);
    res.status(500).json({ success: false, error: 'Erro ao autenticar com Google.' });
  }
});

// ==========================================
// CLIENT AUTHENTICATION ROTAS
// ==========================================

// GET /client/register - Redirect to client login (Google only)
router.get('/client/register', redirectIfAuthenticated, (req, res) => {
  res.redirect('/client/login');
});

// GET /client/login - Render login page for clients (Google Sign-In only)
router.get('/client/login', redirectIfAuthenticated, (req, res) => {
  res.render('client/login', { error: null, success: null });
});



// ==========================================
// GOOGLE SIGN-IN — CLIENTE
// ==========================================

// POST /client/auth/google - Verify Google ID token and create/find client user
router.post('/client/auth/google', async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, error: 'Token não fornecido.' });
    }

    if (!admin) {
      return res.status(503).json({ success: false, error: 'Firebase não configurado. Google Sign-In indisponível.' });
    }

    // Verify the Google ID token with Firebase Admin
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const email = decodedToken.email;
    const name = decodedToken.name || email.split('@')[0];

    if (!email) {
      return res.status(400).json({ success: false, error: 'Conta Google sem e-mail válido.' });
    }

    // Check if user already exists
    let user = await findUserByEmail(email);

    if (user) {
      // User exists — log them in with their existing role
      createSessionJSON(req, res, user, user.role === 'cliente' ? '/client/dashboard' : '/dashboard');
    } else {
      // New user — create as cliente (came from client login page)
      user = await createUser({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: null,
        role: 'cliente',
        auth_provider: 'google',
        google_uid: decodedToken.uid
      });

      createSessionJSON(req, res, user, '/client/dashboard');
    }
  } catch (err) {
    console.error('Error during Google Sign-In (client):', err);
    res.status(500).json({ success: false, error: 'Erro ao autenticar com Google.' });
  }
});

// GET /logout - Clear session
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/login');
  });
});

module.exports = router;
