const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../database/db');
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
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existingUser = checkStmt.get(email.trim().toLowerCase());

    if (existingUser) {
      return res.render('register', { error: 'Este e-mail já está cadastrado.', success: null, data: inputData });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user as barber
    const insertStmt = db.prepare('INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, ?)');
    const result = insertStmt.run(name.trim(), email.trim().toLowerCase(), hashedPassword, 'barbeiro');

    createSession(req, res, {
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'barbeiro',
      phone: null
    }, '/dashboard');
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
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email.trim().toLowerCase());

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
    const checkStmt = db.prepare('SELECT id FROM users WHERE email = ?');
    const existingUser = checkStmt.get(email.trim().toLowerCase());

    if (existingUser) {
      return res.render('client/register', { error: 'Este e-mail já está cadastrado.', success: null, data: inputData });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user as client
    const insertStmt = db.prepare('INSERT INTO users (name, email, phone, password, role) VALUES (?, ?, ?, ?, ?)');
    const result = insertStmt.run(
      name.trim(),
      email.trim().toLowerCase(),
      phone.trim(),
      hashedPassword,
      'cliente'
    );

    createSession(req, res, {
      id: Number(result.lastInsertRowid),
      name: name.trim(),
      email: email.trim().toLowerCase(),
      role: 'cliente',
      phone: phone.trim()
    }, '/client/dashboard');
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
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    const user = stmt.get(email.trim().toLowerCase());

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

