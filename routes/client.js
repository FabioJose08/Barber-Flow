const express = require('express');
const router = express.Router();
const {
  createAppointment,
  findAppointments,
  findAppointmentsByClientId,
  findAppointmentsByPhone,
  linkAppointmentsToClient,
  findAppointmentById,
  findByIdAndUpdate,
  findConfigByUser,
  findBarbers,
  findServicesByUser,
  findServiceById
} = require('../database/repository');
const { requireClient } = require('../middleware/auth');

function generateSlots(openTime, closeTime, intervalMin) {
  const slots = [];
  const [openH, openM] = openTime.split(':').map(Number);
  const [closeH, closeM] = closeTime.split(':').map(Number);
  let current = openH * 60 + openM;
  const end = closeH * 60 + closeM;
  while (current < end) {
    slots.push(`${String(Math.floor(current / 60)).padStart(2, '0')}:${String(current % 60).padStart(2, '0')}`);
    current += intervalMin;
  }
  return slots;
}

async function getBookedSlots(userId, date) {
  const appointments = await findAppointments({
    userId,
    dateStart: `${date}T00:00:00`,
    dateEnd: `${date}T23:59:59`,
    excludeStatus: 'Cancelado'
  });
  return appointments.map((appointment) => {
    const value = new Date(appointment.appointment_date);
    return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
  });
}

async function renderClientBooking(req, res, config, { error = null, data = {} } = {}) {
  const now = new Date();
  const todayStr = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const selectedDate = data.appointment_date || req.query.date || todayStr;
  const bookedSlots = await getBookedSlots(config.user_id, selectedDate);
  const availableSlots = generateSlots(config.open_time, config.close_time, config.slot_interval)
    .filter((slot) => !bookedSlots.includes(slot));

  res.render('booking/index', {
    config,
    services: await findServicesByUser(config.user_id),
    selectedDate,
    availableSlots,
    todayStr,
    error,
    data,
    loggedClient: req.session.user,
    bookingPath: `/client/agendar/${config.user_id}`,
    slotsEndpoint: `/client/agendar/${config.user_id}/slots`
  });
}

// GET /client/dashboard - Client dashboard showing their appointments
router.get('/client/dashboard', requireClient, async (req, res) => {
  const clientId = req.session.user.id;

  try {
    // Get all appointments for this client (by client_id OR by phone if not linked)
    let appointments = await findAppointmentsByClientId(clientId);

    // If no appointments by client_id, try to find by phone (for appointments before account creation)
    if (appointments.length === 0 && req.session.user.phone) {
      appointments = await findAppointmentsByPhone(req.session.user.phone);

      // Link these appointments to the client account for future lookups
      if (appointments.length > 0) {
        await linkAppointmentsToClient(req.session.user.phone, clientId);
      }
    }

    res.render('client/dashboard', {
      user: req.session.user,
      appointments,
      success: req.query.success === '1'
        ? 'Agendamento cancelado com sucesso.'
        : req.query.success === 'booked'
          ? 'Agendamento solicitado com sucesso. Aguarde a confirmação.'
          : null,
      error: null
    });
  } catch (err) {
    console.error('Error loading client dashboard:', err);
    res.status(500).render('error', { error: 'Erro ao carregar seus agendamentos.', user: req.session.user });
  }
});

// GET /client/agendar - authenticated clients choose a barber, never a public link.
router.get('/client/agendar', requireClient, async (req, res) => {
  try {
    const barbers = await findBarbers();
    const entries = await Promise.all(barbers.map(async (barber) => ({
      barber,
      config: await findConfigByUser(barber.id)
    })));
    res.render('client/barbers', { entries: entries.filter((entry) => entry.config), user: req.session.user });
  } catch (err) {
    console.error('Error loading barbers for client booking:', err);
    res.status(500).render('error', { error: 'Erro ao carregar as barbearias.', user: req.session.user });
  }
});

router.get('/client/agendar/:barberId', requireClient, async (req, res) => {
  try {
    const config = await findConfigByUser(req.params.barberId);
    if (!config) return res.status(404).render('error', { error: 'Barbearia não encontrada.', user: req.session.user });
    await renderClientBooking(req, res, config);
  } catch (err) {
    console.error('Error loading client booking:', err);
    res.status(500).render('error', { error: 'Erro ao carregar agendamento.', user: req.session.user });
  }
});

router.get('/client/agendar/:barberId/slots', requireClient, async (req, res) => {
  try {
    const config = await findConfigByUser(req.params.barberId);
    if (!config || !req.query.date) return res.status(404).json({ slots: [] });
    const bookedSlots = await getBookedSlots(config.user_id, req.query.date);
    const slots = generateSlots(config.open_time, config.close_time, config.slot_interval)
      .filter((slot) => !bookedSlots.includes(slot));
    res.json({ slots });
  } catch (err) {
    res.status(500).json({ slots: [] });
  }
});

router.post('/client/agendar/:barberId', requireClient, async (req, res) => {
  try {
    const config = await findConfigByUser(req.params.barberId);
    if (!config) return res.status(404).render('error', { error: 'Barbearia não encontrada.', user: req.session.user });

    const { service_id, appointment_date, time_slot, notes } = req.body;
    if (!req.session.user.phone || !service_id || !appointment_date || !time_slot) {
      return renderClientBooking(req, res, config, { error: 'Complete seu telefone, serviço, data e horário para agendar.', data: req.body });
    }

    const service = await findServiceById(service_id);
    if (!service || service.user_id !== config.user_id) {
      return renderClientBooking(req, res, config, { error: 'Serviço inválido.', data: req.body });
    }

    if ((await getBookedSlots(config.user_id, appointment_date)).includes(time_slot)) {
      return renderClientBooking(req, res, config, { error: 'Este horário acabou de ser reservado. Escolha outro.', data: req.body });
    }

    await createAppointment({
      user_id: config.user_id,
      client_id: req.session.user.id,
      customer_name: req.session.user.name,
      customer_phone: req.session.user.phone,
      service_type: service.name,
      price: service.price,
      status: 'Pendente',
      appointment_date: new Date(`${appointment_date}T${time_slot}`).toISOString(),
      notes: notes ? notes.trim() : ''
    });
    res.redirect('/client/dashboard?success=booked');
  } catch (err) {
    console.error('Error creating client booking:', err);
    res.status(500).render('error', { error: 'Erro ao criar o agendamento.', user: req.session.user });
  }
});

// POST /client/appointments/:id/cancel - Cancel an appointment as a client
router.post('/client/appointments/:id/cancel', requireClient, async (req, res) => {
  const clientId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    // Find the appointment and verify ownership
    const appointment = await findAppointmentById(appointmentId);

    if (!appointment) {
      return res.status(404).render('error', { error: 'Agendamento não encontrado.', user: req.session.user });
    }

    // Check ownership by client_id or phone
    const isOwner = (appointment.client_id && appointment.client_id === clientId) ||
                    (req.session.user.phone && appointment.customer_phone === req.session.user.phone);

    if (!isOwner) {
      return res.status(403).render('error', { error: 'Você não tem permissão para cancelar este agendamento.', user: req.session.user });
    }

    // Only allow cancellation if status is Pendente or Agendado
    if (!['Pendente', 'Agendado'].includes(appointment.status)) {
      return res.redirect('/client/dashboard?error=1');
    }

    await findByIdAndUpdate(appointmentId, { status: 'Cancelado' });

    res.redirect('/client/dashboard?success=1');
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    res.status(500).render('error', { error: 'Erro ao cancelar o agendamento.', user: req.session.user });
  }
});

module.exports = router;
