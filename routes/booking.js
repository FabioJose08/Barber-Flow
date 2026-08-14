const express = require('express');
const router = express.Router();
const db = require('../database/db');

// Helper: generate time slots between open and close time
function generateSlots(openTime, closeTime, intervalMin) {
  const slots = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;
  while (current < end) {
    const h = String(Math.floor(current / 60)).padStart(2, '0');
    const m = String(current % 60).padStart(2, '0');
    slots.push(`${h}:${m}`);
    current += intervalMin;
  }
  return slots;
}

// Helper: get booked slots for a specific date
function getBookedSlots(userId, dateStr) {
  const stmt = db.prepare(`
    SELECT appointment_date FROM appointments
    WHERE user_id = ? AND appointment_date LIKE ? AND status NOT IN ('Cancelado')
  `);
  const rows = stmt.all(userId, `${dateStr}%`);
  return rows.map(r => r.appointment_date.slice(11, 16)); // HH:MM
}

// GET /book/:token - Public booking page (accessible to all; pre-fills if client logged in)
router.get('/book/:token', (req, res) => {
  const { token } = req.params;
  try {
    const configStmt = db.prepare('SELECT * FROM barber_config WHERE booking_token = ?');
    const config = configStmt.get(token);
    if (!config) {
      return res.status(404).render('error', { error: 'Link de agendamento inválido ou expirado.', user: null });
    }

    // Keep the public booking page accessible so the client booking link works
    // even when the barber is logged in from the same browser session.
    const servicesStmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = servicesStmt.all(config.user_id);

    // Default: show today's date
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localNow = new Date(now.getTime() - offset);
    const todayStr = localNow.toISOString().slice(0, 10);

    const selectedDate = req.query.date || todayStr;
    const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
    const bookedSlots = getBookedSlots(config.user_id, selectedDate);
    const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));

    // Pre-fill client data if logged in
    const loggedClient = (req.session && req.session.user && req.session.user.role === 'cliente')
      ? req.session.user : null;

    res.render('booking/index', {
      config,
      services,
      selectedDate,
      availableSlots,
      todayStr,
      error: null,
      data: {},
      loggedClient
    });
  } catch (err) {
    console.error('Error loading booking page:', err);
    res.status(500).render('error', { error: 'Erro ao carregar página de agendamento.', user: null });
  }
});

// POST /book/:token - Client submits booking
router.post('/book/:token', (req, res) => {
  const { token } = req.params;
  const { customer_name, customer_phone, service_id, appointment_date, time_slot, notes } = req.body;

  try {
    const configStmt = db.prepare('SELECT * FROM barber_config WHERE booking_token = ?');
    const config = configStmt.get(token);
    if (!config) {
      return res.status(404).render('error', { error: 'Link inválido.', user: null });
    }

    const servicesStmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = servicesStmt.all(config.user_id);

    const loggedClient = (req.session && req.session.user && req.session.user.role === 'cliente')
      ? req.session.user : null;

    // If client is logged in, use their name and phone
    const finalName = loggedClient ? loggedClient.name : customer_name;
    const finalPhone = loggedClient ? loggedClient.phone : customer_phone;

    // Validate inputs
    if (!finalName || !finalPhone || !service_id || !appointment_date || !time_slot) {
      const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
      const bookedSlots = getBookedSlots(config.user_id, appointment_date || '');
      const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));
      return res.render('booking/index', {
        config, services, selectedDate: appointment_date, availableSlots,
        todayStr: appointment_date, error: 'Por favor, preencha todos os campos obrigatórios.', data: req.body,
        loggedClient
      });
    }

    // Get service details
    const serviceStmt = db.prepare('SELECT * FROM services WHERE id = ? AND user_id = ?');
    const service = serviceStmt.get(service_id, config.user_id);
    if (!service) {
      return res.status(400).render('error', { error: 'Serviço inválido.', user: null });
    }

    // Check if slot is still available
    const bookedSlots = getBookedSlots(config.user_id, appointment_date);
    if (bookedSlots.includes(time_slot)) {
      const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
      const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));
      return res.render('booking/index', {
        config, services, selectedDate: appointment_date, availableSlots,
        todayStr: appointment_date, error: 'Este horário já foi reservado. Escolha outro.', data: req.body,
        loggedClient
      });
    }

    const fullDateTime = `${appointment_date}T${time_slot}`;

    // Determine client_id if logged in
    const clientId = loggedClient ? loggedClient.id : null;

    // Insert appointment with 'Pendente' status
    const insertStmt = db.prepare(`
      INSERT INTO appointments (user_id, customer_name, customer_phone, service_type, price, status, appointment_date, notes, client_id)
      VALUES (?, ?, ?, ?, ?, 'Pendente', ?, ?, ?)
    `);
    insertStmt.run(
      config.user_id,
      finalName.trim(),
      finalPhone.trim(),
      service.name,
      service.price,
      fullDateTime,
      notes ? notes.trim() : '',
      clientId
    );

    res.redirect(`/book/${token}/success?name=${encodeURIComponent(finalName.trim())}&service=${encodeURIComponent(service.name)}&date=${appointment_date}&time=${time_slot}&client=${loggedClient ? '1' : '0'}`);
  } catch (err) {
    console.error('Error creating booking:', err);
    const isConstraintError = err.message && err.message.includes('CHECK constraint failed');
    res.status(500).render('error', {
      error: isConstraintError
        ? 'Erro interno de agendamento. Atualize a página e tente novamente.'
        : 'Erro ao registrar agendamento. Tente novamente.',
      user: null
    });
  }
});

// GET /book/:token/success - Booking confirmation for client
router.get('/book/:token/success', (req, res) => {
  const { token } = req.params;
  try {
    const configStmt = db.prepare('SELECT * FROM barber_config WHERE booking_token = ?');
    const config = configStmt.get(token);
    if (!config) {
      return res.status(404).render('error', { error: 'Link inválido.', user: null });
    }
    const { name, service, date, time, client } = req.query;
    const loggedClient = (req.session && req.session.user && req.session.user.role === 'cliente')
      ? req.session.user : null;
    res.render('booking/success', { config, name, service, date, time, loggedClient, isClientLogged: client === '1' });
  } catch (err) {
    console.error('Error loading success page:', err);
    res.status(500).render('error', { error: 'Erro.', user: null });
  }
});

// GET /book/:token/slots - AJAX: get available slots for a date
router.get('/book/:token/slots', (req, res) => {
  const { token } = req.params;
  const { date } = req.query;
  try {
    const configStmt = db.prepare('SELECT * FROM barber_config WHERE booking_token = ?');
    const config = configStmt.get(token);
    if (!config || !date) return res.json({ slots: [] });

    const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
    const bookedSlots = getBookedSlots(config.user_id, date);
    const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));

    res.json({ slots: availableSlots });
  } catch (err) {
    res.json({ slots: [] });
  }
});

module.exports = router;
