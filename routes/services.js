const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireBarber } = require('../middleware/auth');

// GET /services - List all services for the logged-in barber
router.get('/', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  try {
    let config = db.prepare('SELECT * FROM barber_config WHERE user_id = ?').get(userId);
    if (!config) {
      const crypto = require('crypto');
      const token = crypto.randomBytes(10).toString('hex');
      db.prepare(`
        INSERT INTO barber_config (user_id, shop_name, open_time, close_time, slot_interval, booking_token)
        VALUES (?, 'SAS Barber', '09:00', '20:00', 30, ?)
      `).run(userId, token);
      config = db.prepare('SELECT * FROM barber_config WHERE user_id = ?').get(userId);
    }
    const bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;

    const stmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = stmt.all(userId);
    res.render('services/index', {
      user: req.session.user,
      services,
      config,
      bookingUrl,
      error: null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Error fetching services:', err);
    res.status(500).render('error', { error: 'Erro ao listar serviços.', user: req.session.user });
  }
});

// POST /services - Create a new service
router.post('/', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const { name, price, duration_min } = req.body;

  if (!name || !price) {
    const stmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = stmt.all(userId);
    return res.render('services/index', {
      user: req.session.user,
      services,
      error: 'Nome e preço são obrigatórios.',
      success: null
    });
  }

  const priceNum = parseFloat(price);
  const durationNum = parseInt(duration_min) || 30;

  if (isNaN(priceNum) || priceNum < 0) {
    const stmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = stmt.all(userId);
    return res.render('services/index', {
      user: req.session.user,
      services,
      error: 'Preço inválido.',
      success: null
    });
  }

  try {
    const stmt = db.prepare('INSERT INTO services (user_id, name, price, duration_min) VALUES (?, ?, ?, ?)');
    stmt.run(userId, name.trim(), priceNum, durationNum);
    res.redirect('/services?success=1');
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).render('error', { error: 'Erro ao criar serviço.', user: req.session.user });
  }
});

// POST /services/:id/delete - Delete a service
router.post('/:id/delete', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const serviceId = req.params.id;
  try {
    const stmt = db.prepare('DELETE FROM services WHERE id = ? AND user_id = ?');
    stmt.run(serviceId, userId);
    res.redirect('/services?success=2');
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).render('error', { error: 'Erro ao excluir serviço.', user: req.session.user });
  }
});

// POST /services/config - Update barber configuration (shop name, times, slot interval)
router.post('/config', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const { shop_name, open_time, close_time, slot_interval } = req.body;

  if (!shop_name || !open_time || !close_time || !slot_interval) {
    return res.status(400).send('Preencha todos os campos obrigatórios.');
  }

  const slotIntervalNum = parseInt(slot_interval);
  if (isNaN(slotIntervalNum) || slotIntervalNum <= 0) {
    return res.status(400).send('Intervalo de agendamento inválido.');
  }

  try {
    const stmt = db.prepare(`
      UPDATE barber_config 
      SET shop_name = ?, open_time = ?, close_time = ?, slot_interval = ?
      WHERE user_id = ?
    `);
    stmt.run(shop_name.trim(), open_time, close_time, slotIntervalNum, userId);
    res.redirect('/services?success=config');
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).render('error', { error: 'Erro ao atualizar configurações da barbearia.', user: req.session.user });
  }
});

module.exports = router;
