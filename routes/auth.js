const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { createUser, findUserByEmail } = require('../database/repository');
const { auth } = require('../database/firebase');
const { redirectIfAuthenticated } = require('../middleware/auth');

/**
 * Cria a sessão e redireciona o usuário para a URL adequada.
 */
function createSessionAndRedirect(req, res, user, redirectUrl) {
  req.session.regenerate((err) => {
    if (err) {
      console.error('Error regenerating session:', err);
      return res.status(500).render('error', {
        error: 'Erro interno de autenticação.',
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

async function authenticateWithGoogle(req, res, role) {
  const { idToken } = req.body;
  if (!idToken) {
    return res.status(400).json({ success: false, error: 'Token não fornecido.' });
  }
  if (!auth) {
    return res.status(503).json({ success: false, error: 'Firebase Admin não está configurado no servidor.' });
  }

  const decodedToken = await auth.verifyIdToken(idToken);
  const email = decodedToken.email;
  if (!email) {
    return res.status(400).json({ success: false, error: 'Conta Google sem e-mail válido.' });
  }

  let user = await findUserByEmail(email);
  if (!user) {
    user = await createUser({
      name: (decodedToken.name || email.split('@')[0]).trim(),
      email: email.trim().toLowerCase(),
      password: null,
      role,
      auth_provider: 'google',
      google_uid: decodedToken.uid
    });
  }

  return createSessionJSON(req, res, user, user.role === 'cliente' ? '/client/dashboard' : '/dashboard');
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
// BARBER AUTHENTICATION ROUTES
// ==========================================

// GET /login - Render login page for barbers
router.get('/login', redirectIfAuthenticated, (req, res) => {
  res.render('login', { error: null, success: null });
});

// GET /register - Render register page for barbers
router.get('/register', redirectIfAuthenticated, (req, res) => {
  res.render('register', { error: null });
});

// POST /register - Register a new barber
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.render('register', { error: 'Preencha todos os campos.' });
    }

    if (password.length < 6) {
      return res.render('register', { error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    if (password !== confirmPassword) {
      return res.render('register', { error: 'As senhas não coincidem.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.render('register', { error: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password: hashedPassword,
      role: 'barbeiro',
      auth_provider: 'email'
    });

    createSessionAndRedirect(req, res, user, '/dashboard');
  } catch (err) {
    console.error('Error during barber registration:', err);
    res.render('register', { error: 'Erro ao criar conta. Tente novamente.' });
  }
});

// POST /login - Authenticate barber with email/password
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('login', { error: 'Preencha todos os campos.', success: null });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password) {
      return res.render('login', { error: 'E-mail ou senha incorretos.', success: null });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('login', { error: 'E-mail ou senha incorretos.', success: null });
    }

    const redirectUrl = user.role === 'cliente' ? '/client/dashboard' : '/dashboard';
    createSessionAndRedirect(req, res, user, redirectUrl);
  } catch (err) {
    console.error('Error during barber login:', err);
    res.render('login', { error: 'Erro ao fazer login. Tente novamente.', success: null });
  }
});

router.post('/auth/google', async (req, res) => {
  try {
    await authenticateWithGoogle(req, res, 'barbeiro');
  } catch (err) {
    console.error('Error during Google Sign-In (barber):', err);
    res.status(500).json({ success: false, error: 'Erro ao autenticar com Google.' });
  }
});

// ==========================================
// CLIENT AUTHENTICATION ROUTES
// ==========================================

// GET /client/login - Render login page for clients
router.get('/client/login', redirectIfAuthenticated, (req, res) => {
  res.render('client/login', { error: null, success: null });
});

// GET /client/register - Render register page for clients
router.get('/client/register', redirectIfAuthenticated, (req, res) => {
  res.render('client/register', { error: null });
});

// POST /client/register - Register a new client
router.post('/client/register', async (req, res) => {
  try {
    const { name, email, phone, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.render('client/register', { error: 'Preencha todos os campos obrigatórios.' });
    }

    if (password.length < 6) {
      return res.render('client/register', { error: 'A senha deve ter pelo menos 6 caracteres.' });
    }

    if (password !== confirmPassword) {
      return res.render('client/register', { error: 'As senhas não coincidem.' });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.render('client/register', { error: 'Este e-mail já está cadastrado.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await createUser({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      password: hashedPassword,
      role: 'cliente',
      auth_provider: 'email'
    });

    createSessionAndRedirect(req, res, user, '/client/dashboard');
  } catch (err) {
    console.error('Error during client registration:', err);
    res.render('client/register', { error: 'Erro ao criar conta. Tente novamente.' });
  }
});

// POST /client/login - Authenticate client with email/password
router.post('/client/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('client/login', { error: 'Preencha todos os campos.', success: null });
    }

    const user = await findUserByEmail(email);
    if (!user || !user.password) {
      return res.render('client/login', { error: 'E-mail ou senha incorretos.', success: null });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.render('client/login', { error: 'E-mail ou senha incorretos.', success: null });
    }

    const redirectUrl = user.role === 'cliente' ? '/client/dashboard' : '/dashboard';
    createSessionAndRedirect(req, res, user, redirectUrl);
  } catch (err) {
    console.error('Error during client login:', err);
    res.render('client/login', { error: 'Erro ao fazer login. Tente novamente.', success: null });
  }
});

router.post('/client/auth/google', async (req, res) => {
  try {
    await authenticateWithGoogle(req, res, 'cliente');
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
