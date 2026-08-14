const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

// Initialize MongoDB connection
require('./database/mongodb');

const app = express();

// Configure view engine (EJS)
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Body parsing middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files middleware
app.use(express.static(path.join(__dirname, 'public')));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'barberflow_default_secret_key_88331',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days session life
    secure: false, // Set to true when running under HTTPS (production)
    httpOnly: true
  }
}));

// Middleware to inject session data & nav helpers globally to EJS templates
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  res.locals.activePage = req.path.split('/')[1] || '';
  next();
});

// Enforce strict role-based route separation before any route handlers execute
app.use((req, res, next) => {
  const user = req.session && req.session.user;
  const path = req.path;
  const adminPaths = ['/dashboard', '/appointments', '/financial', '/services'];
  const isAdminPath = adminPaths.some((p) => path === p || path.startsWith(`${p}/`));
  const isClientPath = path === '/client' || path.startsWith('/client/');
  const isBookingPath = path.startsWith('/book/');

  // If barber session exists and the request is for client/public booking pages,
  // destroy the barber session and continue with a clean client/public session.
  if (user && user.role === 'barbeiro' && (isClientPath || isBookingPath)) {
    return req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying barber session on client/public route:', err);
      }
      res.locals.user = null;
      next();
    });
  }

  // If a client attempts to access an admin route, keep them out.
  if (user && user.role === 'cliente' && isAdminPath) {
    return res.redirect('/client/dashboard');
  }

  // If an unauthenticated request hits an admin page, leave it to auth middleware to redirect.
  next();
});

// Mount routes
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const appointmentRoutes = require('./routes/appointments');
const chatbotRoutes = require('./routes/chatbot');
const bookingRoutes = require('./routes/booking');
const financialRoutes = require('./routes/financial');
const servicesRoutes = require('./routes/services');
const clientRoutes = require('./routes/client');

app.use('/', authRoutes);
app.use('/', dashboardRoutes);
app.use('/appointments', appointmentRoutes);
app.use('/', chatbotRoutes);
app.use('/', bookingRoutes);
app.use('/', financialRoutes);
app.use('/services', servicesRoutes);
app.use('/', clientRoutes);

// Catch-all 404 Route
app.use((req, res) => {
  res.status(404).render('error', { 
    error: 'A página que você está procurando não existe ou foi movida.',
    user: req.session.user || null
  });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Global server error:', err);
  res.status(500).render('error', {
    error: 'Ocorreu um erro interno no servidor. Por favor, tente novamente mais tarde.',
    user: req.session.user || null
  });
});

// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`💈 BARBERFLOW SERVER IS ONLINE!`);
  console.log(`🌐 Local URL: http://localhost:${PORT}`);
  console.log(`📁 Database: MongoDB (Vercel Compatible)`);
  console.log(`======================================================\n`);
});
