const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireBarber } = require('../middleware/auth');

// GET /appointments - List and filter appointments
router.get('/', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const { date_filter, status_filter, search } = req.query;

  try {
    let query = 'SELECT * FROM appointments WHERE user_id = ?';
    const params = [userId];

    // Search by customer name
    if (search && search.trim() !== '') {
      query += ' AND customer_name LIKE ?';
      params.push(`%${search.trim()}%`);
    }

    // Filter by status
    if (status_filter && status_filter !== 'all') {
      query += ' AND status = ?';
      params.push(status_filter);
    }

    // Filter by date
    if (date_filter && date_filter !== 'all') {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      if (date_filter === 'today') {
        query += ' AND appointment_date LIKE ?';
        params.push(`${todayStr}%`);
      } else if (date_filter === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const ty = tomorrow.getFullYear();
        const tm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const td = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowStr = `${ty}-${tm}-${td}`;

        query += ' AND appointment_date LIKE ?';
        params.push(`${tomorrowStr}%`);
      } else if (date_filter === 'week') {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const wy = weekEnd.getFullYear();
        const wm = String(weekEnd.getMonth() + 1).padStart(2, '0');
        const wd = String(weekEnd.getDate()).padStart(2, '0');
        const weekEndStr = `${wy}-${wm}-${wd}T23:59`;

        query += ' AND appointment_date >= ? AND appointment_date <= ?';
        params.push(`${todayStr}T00:00`, weekEndStr);
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(date_filter)) {
        // Specific date selected
        query += ' AND appointment_date LIKE ?';
        params.push(`${date_filter}%`);
      }
    }

    // Order by date (earliest first)
    query += ' ORDER BY appointment_date ASC';

    const stmt = db.prepare(query);
    const appointments = stmt.all(...params);

    const servicesStmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = servicesStmt.all(userId);

    res.render('appointments/index', {
      user: req.session.user,
      appointments,
      services,
      filters: {
        date_filter: date_filter || 'all',
        status_filter: status_filter || 'all',
        search: search || ''
      }
    });
  } catch (err) {
    console.error('Error fetching appointments:', err);
    res.status(500).render('error', { 
      error: 'Erro ao listar agendamentos.', 
      user: req.session.user 
    });
  }
});

// GET /appointments/new - Form to create a new appointment
router.get('/new', requireBarber, (req, res) => {
  // Get current local datetime formatted for input field (YYYY-MM-DDTHH:MM)
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const currentLocalDateTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);

  try {
    const userId = req.session.user.id;
    const servicesStmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = servicesStmt.all(userId);

    res.render('appointments/new', {
      user: req.session.user,
      services,
      error: null,
      currentLocalDateTime,
      data: {}
    });
  } catch (err) {
    console.error('Error fetching services for new appointment:', err);
    res.status(500).render('error', { error: 'Erro ao carregar página de novo agendamento.', user: req.session.user });
  }
});

// POST /appointments - Create new appointment
router.post('/', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const { customer_name, customer_phone, service_type, price, status, appointment_date, notes } = req.body;

  const inputData = { customer_name, customer_phone, service_type, price, status, appointment_date, notes };

  try {
    if (!customer_name || !customer_phone || !service_type || !price || !status || !appointment_date) {
      return res.render('appointments/new', {
        user: req.session.user,
        error: 'Preencha todos os campos obrigatórios.',
        currentLocalDateTime: appointment_date,
        data: inputData
      });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.render('appointments/new', {
        user: req.session.user,
        error: 'O preço deve ser um valor numérico válido.',
        currentLocalDateTime: appointment_date,
        data: inputData
      });
    }

    const validStatuses = ['Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado'];
    if (!validStatuses.includes(status)) {
      return res.render('appointments/new', {
        user: req.session.user,
        error: 'Status de agendamento inválido.',
        currentLocalDateTime: appointment_date,
        data: inputData
      });
    }

    // Insert appointment
    const stmt = db.prepare(`
      INSERT INTO appointments (user_id, customer_name, customer_phone, service_type, price, status, appointment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(
      userId,
      customer_name.trim(),
      customer_phone.trim(),
      service_type.trim(),
      priceNum,
      status,
      appointment_date, // stored as YYYY-MM-DDTHH:MM
      notes ? notes.trim() : ''
    );

    res.redirect('/appointments');
  } catch (err) {
    console.error('Error creating appointment:', err);
    res.render('appointments/new', {
      user: req.session.user,
      error: 'Erro interno ao salvar agendamento. Tente novamente.',
      currentLocalDateTime: appointment_date,
      data: inputData
    });
  }
});

// GET /appointments/:id/edit - Form to edit appointment
router.get('/:id/edit', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    const stmt = db.prepare('SELECT * FROM appointments WHERE id = ? AND user_id = ?');
    const appointment = stmt.get(appointmentId, userId);

    if (!appointment) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado ou não pertence à sua conta.', 
        user: req.session.user 
      });
    }

    res.render('appointments/edit', {
      user: req.session.user,
      appointment,
      error: null
    });
  } catch (err) {
    console.error('Error fetching appointment for edit:', err);
    res.status(500).render('error', { 
      error: 'Erro ao carregar agendamento.', 
      user: req.session.user 
    });
  }
});

// POST /appointments/:id/edit - Save edited appointment
router.post('/:id/edit', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { customer_name, customer_phone, service_type, price, status, appointment_date, notes } = req.body;

  try {
    // Verify ownership
    const checkStmt = db.prepare('SELECT id FROM appointments WHERE id = ? AND user_id = ?');
    const appointment = checkStmt.get(appointmentId, userId);

    if (!appointment) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado.', 
        user: req.session.user 
      });
    }

    if (!customer_name || !customer_phone || !service_type || !price || !status || !appointment_date) {
      return res.render('appointments/edit', {
        user: req.session.user,
        appointment: { id: appointmentId, customer_name, customer_phone, service_type, price, status, appointment_date, notes },
        error: 'Preencha todos os campos obrigatórios.'
      });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.render('appointments/edit', {
        user: req.session.user,
        appointment: { id: appointmentId, customer_name, customer_phone, service_type, price, status, appointment_date, notes },
        error: 'O preço deve ser um valor numérico válido.'
      });
    }

    // Update appointment
    const updateStmt = db.prepare(`
      UPDATE appointments 
      SET customer_name = ?, customer_phone = ?, service_type = ?, price = ?, status = ?, appointment_date = ?, notes = ?
      WHERE id = ? AND user_id = ?
    `);

    updateStmt.run(
      customer_name.trim(),
      customer_phone.trim(),
      service_type.trim(),
      priceNum,
      status,
      appointment_date,
      notes ? notes.trim() : '',
      appointmentId,
      userId
    );

    res.redirect('/appointments');
  } catch (err) {
    console.error('Error updating appointment:', err);
    res.status(500).render('error', { 
      error: 'Erro interno ao atualizar o agendamento.', 
      user: req.session.user 
    });
  }
});

// POST /appointments/:id/delete - Delete appointment
router.post('/:id/delete', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    const deleteStmt = db.prepare('DELETE FROM appointments WHERE id = ? AND user_id = ?');
    const result = deleteStmt.run(appointmentId, userId);

    if (result.changes === 0) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado ou não pertence a você.', 
        user: req.session.user 
      });
    }

    // Redirect to referer page if it exists (e.g. dashboard or appointments list), otherwise /appointments
    const redirectUrl = req.headers.referer || '/appointments';
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Error deleting appointment:', err);
    res.status(500).render('error', { 
      error: 'Erro ao excluir o agendamento.', 
      user: req.session.user 
    });
  }
});

// POST /appointments/:id/status - Quick update status of an appointment
router.post('/:id/status', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { status } = req.body;

  try {
    const validStatuses = ['Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).send('Status inválido.');
    }

    const updateStmt = db.prepare('UPDATE appointments SET status = ? WHERE id = ? AND user_id = ?');
    const result = updateStmt.run(status, appointmentId, userId);

    if (result.changes === 0) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado ou não autorizado.', 
        user: req.session.user 
      });
    }

    const redirectUrl = req.headers.referer || '/dashboard';
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Error quick updating status:', err);
    res.status(500).render('error', { 
      error: 'Erro ao atualizar o status do agendamento.', 
      user: req.session.user 
    });
  }
});

// POST /appointments/:id/finalize - Finalize an appointment with actual price and service type
router.post('/:id/finalize', requireBarber, (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { service_type, price, notes } = req.body;

  try {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).send('Preço inválido.');
    }

    const updateStmt = db.prepare(`
      UPDATE appointments 
      SET status = 'Finalizado', service_type = ?, price = ?, notes = COALESCE(NULLIF(?, ''), notes)
      WHERE id = ? AND user_id = ?
    `);
    const result = updateStmt.run(service_type.trim(), priceNum, notes ? notes.trim() : '', appointmentId, userId);

    if (result.changes === 0) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado ou não autorizado.', 
        user: req.session.user 
      });
    }

    const redirectUrl = req.headers.referer || '/dashboard';
    res.redirect(redirectUrl);
  } catch (err) {
    console.error('Error finalizing appointment:', err);
    res.status(500).render('error', { 
      error: 'Erro ao finalizar o agendamento.', 
      user: req.session.user 
    });
  }
});

module.exports = router;
