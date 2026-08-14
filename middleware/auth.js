/**
 * Middleware to protect routes that require barber authentication.
 */
function requireBarber(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'barbeiro') {
      res.locals.user = req.session.user;
      return next();
    }
    // Redirect clients trying to access barber area
    return res.redirect('/client/dashboard');
  }
  // Redirect to login if user is not authenticated
  res.redirect('/login');
}

/**
 * Middleware to protect routes that require client authentication.
 */
function requireClient(req, res, next) {
  if (req.session && req.session.user) {
    if (req.session.user.role === 'cliente') {
      res.locals.user = req.session.user;
      return next();
    }

    // Clear any barber session if a barber tries to access client area.
    return req.session.destroy((err) => {
      if (err) {
        console.error('Error destroying session for client route:', err);
      }
      res.redirect('/client/login');
    });
  }

  // Redirect to client login if client is not authenticated
  res.redirect('/client/login');
}

/**
 * Middleware to protect routes that require any authentication (fallback).
 */
function requireAuth(req, res, next) {
  if (req.session && req.session.user) {
    res.locals.user = req.session.user;
    return next();
  }
  res.redirect('/login');
}

/**
 * Middleware to redirect already authenticated users away from auth pages (login/register).
 */
function redirectIfAuthenticated(req, res, next) {
  if (req.session && req.session.user) {
    const role = req.session.user.role;

    if (req.path.startsWith('/client/')) {
      if (role === 'cliente') {
        return res.redirect('/client/dashboard');
      }

      // Destroy barber session when accessing client auth pages so the login is isolated.
      return req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session on role switch:', err);
        }
        res.locals.user = null;
        next();
      });
    }

    if (role === 'barbeiro') {
      return res.redirect('/dashboard');
    }
    return res.redirect('/client/dashboard');
  }
  next();
}

module.exports = {
  requireAuth,
  requireBarber,
  requireClient,
  redirectIfAuthenticated
};

