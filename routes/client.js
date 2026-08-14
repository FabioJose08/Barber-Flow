const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireClient } = require('../middleware/auth');

// GET /client/dashboard - Client dashboard showing their appointments
router.get('/client/dashboard', requireClient, (req, res) => {
  const clientId = req.session.user.id;

  try {
    // Get all appointments for this client (by client_id OR by phone if not linked)
    const stmt = db.prepare(`
      SELECT * FROM appointments 
      WHERE client_id = ?
      ORDER BY appointment_date DESC
    `);
    let appointments = stmt.all(clientId);

    // If no appointments by client_id, try to find by phone (for appointments before account creation)
    if (appointments.length === 0 && req.session.user.phone) {
      const phoneStmt = db.prepare(`
        SELECT * FROM appointments 
        WHERE customer_phone = ?
        ORDER BY appointment_date DESC
      `);
      appointments = phoneStmt.all(req.session.user.phone);
      
      // Link these appointments to the client account for future lookups
      if (appointments.length > 0) {
        const linkStmt = db.prepare('UPDATE appointments SET client_id = ? WHERE customer_phone = ? AND client_id IS NULL');
        linkStmt.run(clientId, req.session.user.phone);
      }
    }

    // Try to find the barber's booking URL to link for new appointments
    let bookingUrl = null;
    if (appointments.length > 0) {
      const configStmt = db.prepare('SELECT booking_token FROM barber_config WHERE user_id = ?');
      const config = configStmt.get(appointments[0].user_id);
      if (config) {
        bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;
      }
    } else {
      // Fallback: get the first barber config available
      const configStmt = db.prepare('SELECT booking_token FROM barber_config LIMIT 1');
      const config = configStmt.get();
      if (config) {
        bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;
      }
    }

    res.render('client/dashboard', {
      user: req.session.user,
      appointments,
      bookingUrl,
      success: req.query.success === '1' ? 'Agendamento cancelado com sucesso.' : null,
      error: null
    });
  } catch (err) {
    console.error('Error loading client dashboard:', err);
    res.status(500).render('error', { error: 'Erro ao carregar seus agendamentos.', user: req.session.user });
  }
});

// POST /client/appointments/:id/cancel - Cancel an appointment as a client
router.post('/client/appointments/:id/cancel', requireClient, (req, res) => {
  const clientId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    // Find the appointment and verify ownership
    const checkStmt = db.prepare('SELECT * FROM appointments WHERE id = ?');
    const appointment = checkStmt.get(appointmentId);

    if (!appointment) {
      return res.status(404).render('error', { error: 'Agendamento não encontrado.', user: req.session.user });
    }

    // Check ownership by client_id or phone
    const isOwner = appointment.client_id === clientId || 
                    (req.session.user.phone && appointment.customer_phone === req.session.user.phone);
    
    if (!isOwner) {
      return res.status(403).render('error', { error: 'Você não tem permissão para cancelar este agendamento.', user: req.session.user });
    }

    // Only allow cancellation if status is Pendente or Agendado
    if (!['Pendente', 'Agendado'].includes(appointment.status)) {
      return res.redirect('/client/dashboard?error=1');
    }

    const updateStmt = db.prepare("UPDATE appointments SET status = 'Cancelado' WHERE id = ?");
    updateStmt.run(appointmentId);

    res.redirect('/client/dashboard?success=1');
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    res.status(500).render('error', { error: 'Erro ao cancelar o agendamento.', user: req.session.user });
  }
});

module.exports = router;
