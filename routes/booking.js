const express = require('express');
const router = express.Router();
const {
  createAppointment,
  findAppointments,
  findServicesByUser,
  findServiceById,
  findConfigByUser,
  findConfigByToken
} = require('../database/repository');

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
async function getBookedSlots(userId, dateStr) {
  if (!dateStr) return [];

  const dateStart = `${dateStr}T00:00:00`;
  const dateEnd = `${dateStr}T23:59:59`;

  const appointments = await findAppointments({
    userId,
    dateStart,
    dateEnd,
    excludeStatus: 'Cancelado'
  });

  return appointments.map(a => {
    const dateObj = new Date(a.appointment_date);
    const h = String(dateObj.getHours()).padStart(2, '0');
    const m = String(dateObj.getMinutes()).padStart(2, '0');
    return `${h}:${m}`;
  });
}

// GET /book/barber/:barberId - Permanent public booking address.
router.get('/book/barber/:barberId', async (req, res) => {
  try {
    const config = await findConfigByUser(req.params.barberId);
    if (!config) {
      return res.status(404).render('error', { error: 'Página de agendamento não encontrada.', user: null });
    }

    return res.redirect(`/book/${config.booking_token}`);
  } catch (err) {
    console.error('Error loading permanent booking page:', err);
    return res.status(500).render('error', { error: 'Erro ao carregar página de agendamento.', user: null });
  }
});

// GET /book/:token - Legacy public booking URL kept for existing shares.
router.get('/book/:token', async (req, res) => {
  const { token } = req.params;
  try {
    const config = await findConfigByToken(token);
    if (!config) {
      return res.status(404).render('error', { error: 'Link de agendamento inválido ou expirado.', user: null });
    }

    const services = await findServicesByUser(config.user_id);

    // Default: show today's date
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    const localNow = new Date(now.getTime() - offset);
    const todayStr = localNow.toISOString().slice(0, 10);

    const selectedDate = req.query.date || todayStr;
    const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
    const bookedSlots = await getBookedSlots(config.user_id, selectedDate);
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
router.post('/book/:token', async (req, res) => {
  const { token } = req.params;
  const { customer_name, customer_phone, service_id, appointment_date, time_slot, notes } = req.body;

  try {
    const config = await findConfigByToken(token);
    if (!config) {
      return res.status(404).render('error', { error: 'Link inválido.', user: null });
    }

    const services = await findServicesByUser(config.user_id);

    const loggedClient = (req.session && req.session.user && req.session.user.role === 'cliente')
      ? req.session.user : null;

    // If client is logged in, use their name and phone
    const finalName = loggedClient ? loggedClient.name : customer_name;
    const finalPhone = loggedClient ? loggedClient.phone : customer_phone;

    // Validate inputs
    if (!finalName || !finalPhone || !service_id || !appointment_date || !time_slot) {
      const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
      const bookedSlots = await getBookedSlots(config.user_id, appointment_date || '');
      const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));
      return res.render('booking/index', {
        config, services, selectedDate: appointment_date, availableSlots,
        todayStr: appointment_date, error: 'Por favor, preencha todos os campos obrigatórios.', data: req.body,
        loggedClient
      });
    }

    // Get service details
    const service = await findServiceById(service_id);
    if (!service || service.user_id !== config.user_id) {
      return res.status(400).render('error', { error: 'Serviço inválido.', user: null });
    }

    // Check if slot is still available
    const bookedSlots = await getBookedSlots(config.user_id, appointment_date);
    if (bookedSlots.includes(time_slot)) {
      const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
      const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));
      return res.render('booking/index', {
        config, services, selectedDate: appointment_date, availableSlots,
        todayStr: appointment_date, error: 'Este horário já foi reservado. Escolha outro.', data: req.body,
        loggedClient
      });
    }

    const fullDateTime = new Date(`${appointment_date}T${time_slot}`).toISOString();

    // Determine client_id if logged in
    const clientId = loggedClient ? loggedClient.id : null;

    // Create and save appointment with 'Pendente' status
    await createAppointment({
      user_id: config.user_id,
      customer_name: finalName.trim(),
      customer_phone: finalPhone.trim(),
      service_type: service.name,
      price: service.price,
      status: 'Pendente',
      appointment_date: fullDateTime,
      notes: notes ? notes.trim() : '',
      client_id: clientId
    });

    res.redirect(`/book/${token}/success?name=${encodeURIComponent(finalName.trim())}&service=${encodeURIComponent(service.name)}&date=${appointment_date}&time=${time_slot}&client=${loggedClient ? '1' : '0'}`);
  } catch (err) {
    console.error('Error creating booking:', err);
    res.status(500).render('error', {
      error: 'Erro ao registrar agendamento. Tente novamente.',
      user: null
    });
  }
});

// GET /book/:token/success - Booking confirmation for client
router.get('/book/:token/success', async (req, res) => {
  const { token } = req.params;
  try {
    const config = await findConfigByToken(token);
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
router.get('/book/:token/slots', async (req, res) => {
  const { token } = req.params;
  const { date } = req.query;
  try {
    const config = await findConfigByToken(token);
    if (!config || !date) return res.json({ slots: [] });

    const allSlots = generateSlots(config.open_time, config.close_time, config.slot_interval);
    const bookedSlots = await getBookedSlots(config.user_id, date);
    const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));

    res.json({ slots: availableSlots });
  } catch (err) {
    res.json({ slots: [] });
  }
});

module.exports = router;
