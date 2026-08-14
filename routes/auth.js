const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { createUser, findUserByEmail } = require('../database/repository');
const { admin } = require('../database/firebase');
const { redirectIfAuthenticated } = require('../middleware/auth');

function createSession(req, res, user, redirectUrl) {
  req.session.regenerate((err) => {
    if (err) {
      console.error('Error regenerating session:', err);
      return res.status(500).render('error', {
        error: 'Erro interno de autenticação. Tente novamente.',
        user: null
      });
    }

    req.session.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role || 'cliente',
      phone: user.phone || null
    };

    res.redirect(redirectUrl);
  });
}

/**
 * Variação de createSession que retorna JSON em vez de redirect,
 * usada pelas rotas de Google Sign-In (chamadas via fetch/AJAX).
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

// GET /register - Render registration page for barbers
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', { error: null, success: null, data: {} });
});

// POST /register - Handle registration logic for barbers
router.post('/register', redirectIfAuthenticated, async (req, res) => {
  const { name, email, password, confirmPassword } = req.body;
  const inputData = { name, email };

  try {
    if (!name || !email || !password || !confirmPassword) {
      return res.render('register', { error: 'Preencha todos os campos.', success: null, data: inputData });
    }

    if (password !== confirmPassword) {
      return res.render('register', { error: 'As senhas não coincidem.', success: null, data: inputData });
    }

    if (password.length < 6) {
      return res.render('register', { error: 'A senha deve ter pelo menos 6 caracteres.', success: null, data: inputData });
    }

    // Check if user already exists
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.render('register', { error: 'Este e-mail já está cadastrado.', success: null, data: inputData });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new barber user
    const newUser = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: 'barbeiro'
    });

    createSession(req, res, newUser, '/dashboard');
  } catch (err) {
    console.error('Error during registration:', err);
    res.render('register', { error: 'Erro interno ao realizar cadastro. Tente novamente.', success: null, data: inputData });
  }
});

// GET /login - Render login page for barbers
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { error: null, success: null, email: '' });
});

// POST /login - Handle login logic for barbers & redirect appropriately
router.post('/login', redirectIfAuthenticated, async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.render('login', { error: 'Por favor, preencha todos os campos.', success: null, email });
    }

    // Fetch user
    const user = await findUserByEmail(email);

    if (!user) {
      return res.render('login', { error: 'E-mail ou senha incorretos.', success: null, email });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.render('login', { error: 'E-mail ou senha incorretos.', success: null, email });
    }

    createSession(req, res, user, user.role === 'cliente' ? '/client/dashboard' : '/dashboard');
  } catch (err) {
    console.error('Error during login:', err);
    res.render('login', { error: 'Erro interno ao realizar login. Tente novamente.', success: null, email });
  }
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

// GET /client/register - Render registration page for clients
router.get('/client/register', redirectIfAuthenticated, (req, res) => {
  res.render('client/register', { error: null, success: null, data: {} });
});

// POST /client/register - Handle registration logic for clients
router.post('/client/register', redirectIfAuthenticated, async (req, res) => {
  const { name, email, phone, password, confirmPassword } = req.body;
  const inputData = { name, email, phone };

  try {
    if (!name || !email || !phone || !password || !confirmPassword) {
      return res.render('client/register', { error: 'Preencha todos os campos obrigatórios.', success: null, data: inputData });
    }

    if (password !== confirmPassword) {
      return res.render('client/register', { error: 'As senhas não coincidem.', success: null, data: inputData });
    }

    if (password.length < 6) {
      return res.render('client/register', { error: 'A senha deve ter pelo menos 6 caracteres.', success: null, data: inputData });
    }

    // Check if email already registered
    const existingUser = await findUserByEmail(email);

    if (existingUser) {
      return res.render('client/register', { error: 'Este e-mail já está cadastrado.', success: null, data: inputData });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new client user
    const newUser = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      password: hashedPassword,
      role: 'cliente'
    });

    createSession(req, res, newUser, '/client/dashboard');
  } catch (err) {
    console.error('Error during client registration:', err);
    res.render('client/register', { error: 'Erro ao realizar cadastro de cliente. Tente novamente.', success: null, data: inputData });
  }
});

// GET /client/login - Render login page for clients
router.get('/client/login', redirectIfAuthenticated, (req, res) => {
  res.render('client/login', { error: null, success: null, email: '' });
});

// POST /client/login - Handle login logic for clients
router.post('/client/login', redirectIfAuthenticated, async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.render('client/login', { error: 'Por favor, preencha todos os campos.', success: null, email });
    }

    // Fetch user
    const user = await findUserByEmail(email);

    if (!user) {
      return res.render('client/login', { error: 'E-mail ou senha incorretos.', success: null, email });
    }

    // Compare password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.render('client/login', { error: 'E-mail ou senha incorretos.', success: null, email });
    }

    if (user.role === 'barbeiro') {
      return res.render('client/login', { error: 'Este e-mail pertence a um barbeiro, use a área de barbeiro.', success: null, email });
    }

    createSession(req, res, user, '/client/dashboard');
  } catch (err) {
    console.error('Error during client login:', err);
    res.render('client/login', { error: 'Erro ao realizar login. Tente novamente.', success: null, email });
  }
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
