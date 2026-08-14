const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Appointment, Service } = require('../database/models');
const { requireBarber } = require('../middleware/auth');

// GET /appointments - List and filter appointments
router.get('/', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const { date_filter, status_filter, search } = req.query;

  try {
    const filter = { user_id: new mongoose.Types.ObjectId(userId) };

    // Search by customer name
    if (search && search.trim() !== '') {
      filter.customer_name = { $regex: search.trim(), $options: 'i' };
    }

    // Filter by status
    if (status_filter && status_filter !== 'all') {
      filter.status = status_filter;
    }

    // Filter by date
    if (date_filter && date_filter !== 'all') {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      const todayStr = `${year}-${month}-${day}`;

      if (date_filter === 'today') {
        const todayStart = new Date(`${todayStr}T00:00:00`);
        const todayEnd = new Date(`${todayStr}T23:59:59`);
        filter.appointment_date = { $gte: todayStart, $lte: todayEnd };
      } else if (date_filter === 'tomorrow') {
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const ty = tomorrow.getFullYear();
        const tm = String(tomorrow.getMonth() + 1).padStart(2, '0');
        const td = String(tomorrow.getDate()).padStart(2, '0');
        const tomorrowStr = `${ty}-${tm}-${td}`;
        const tomorrowStart = new Date(`${tomorrowStr}T00:00:00`);
        const tomorrowEnd = new Date(`${tomorrowStr}T23:59:59`);
        filter.appointment_date = { $gte: tomorrowStart, $lte: tomorrowEnd };
      } else if (date_filter === 'week') {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() + 7);
        const weekStart = new Date(`${todayStr}T00:00:00`);
        filter.appointment_date = { $gte: weekStart, $lte: weekEnd };
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(date_filter)) {
        // Specific date selected
        const dateStart = new Date(`${date_filter}T00:00:00`);
        const dateEnd = new Date(`${date_filter}T23:59:59`);
        filter.appointment_date = { $gte: dateStart, $lte: dateEnd };
      }
    }

    const appointments = await Appointment.find(filter).sort({ appointment_date: 1 });
    const services = await Service.find({ user_id: new mongoose.Types.ObjectId(userId) }).sort({ name: 1 });

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
router.get('/new', requireBarber, async (req, res) => {
  // Get current local datetime formatted for input field (YYYY-MM-DDTHH:MM)
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const currentLocalDateTime = new Date(now.getTime() - offset).toISOString().slice(0, 16);

  try {
    const userId = req.session.user.id;
    const services = await Service.find({ user_id: new mongoose.Types.ObjectId(userId) }).sort({ name: 1 });

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
router.post('/', requireBarber, async (req, res) => {
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

    // Create and save appointment
    const appointment = new Appointment({
      user_id: new mongoose.Types.ObjectId(userId),
      customer_name: customer_name.trim(),
      customer_phone: customer_phone.trim(),
      service_type: service_type.trim(),
      price: priceNum,
      status,
      appointment_date: new Date(appointment_date),
      notes: notes ? notes.trim() : ''
    });
    
    await appointment.save();

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
router.get('/:id/edit', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    const appointment = await Appointment.findOne({
      _id: new mongoose.Types.ObjectId(appointmentId),
      user_id: new mongoose.Types.ObjectId(userId)
    });

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
router.post('/:id/edit', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { customer_name, customer_phone, service_type, price, status, appointment_date, notes } = req.body;

  try {
    // Verify ownership
    const appointment = await Appointment.findOne({
      _id: new mongoose.Types.ObjectId(appointmentId),
      user_id: new mongoose.Types.ObjectId(userId)
    });

    if (!appointment) {
      return res.status(404).render('error', { 
        error: 'Agendamento não encontrado.', 
        user: req.session.user 
      });
    }

    if (!customer_name || !customer_phone || !service_type || !price || !status || !appointment_date) {
      return res.render('appointments/edit', {
        user: req.session.user,
        appointment: { _id: appointmentId, customer_name, customer_phone, service_type, price, status, appointment_date, notes },
        error: 'Preencha todos os campos obrigatórios.'
      });
    }

    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.render('appointments/edit', {
        user: req.session.user,
        appointment: { _id: appointmentId, customer_name, customer_phone, service_type, price, status, appointment_date, notes },
        error: 'O preço deve ser um valor numérico válido.'
      });
    }

    // Update appointment
    await Appointment.findByIdAndUpdate(
      new mongoose.Types.ObjectId(appointmentId),
      {
        customer_name: customer_name.trim(),
        customer_phone: customer_phone.trim(),
        service_type: service_type.trim(),
        price: priceNum,
        status,
        appointment_date: new Date(appointment_date),
        notes: notes ? notes.trim() : ''
      },
      { new: true }
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
router.post('/:id/delete', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;

  try {
    const result = await Appointment.deleteOne({
      _id: new mongoose.Types.ObjectId(appointmentId),
      user_id: new mongoose.Types.ObjectId(userId)
    });

    if (result.deletedCount === 0) {
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
router.post('/:id/status', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { status } = req.body;

  try {
    const validStatuses = ['Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado'];
    if (!validStatuses.includes(status)) {
      return res.status(400).send('Status inválido.');
    }

    const result = await Appointment.findByIdAndUpdate(
      new mongoose.Types.ObjectId(appointmentId),
      { status },
      { new: true }
    );

    if (!result || result.user_id.toString() !== userId) {
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
router.post('/:id/finalize', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const appointmentId = req.params.id;
  const { service_type, price, notes } = req.body;

  try {
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum < 0) {
      return res.status(400).send('Preço inválido.');
    }

    const updateData = {
      status: 'Finalizado',
      service_type: service_type.trim(),
      price: priceNum
    };

    // Only update notes if provided
    if (notes && notes.trim()) {
      updateData.notes = notes.trim();
    }

    const result = await Appointment.findByIdAndUpdate(
      new mongoose.Types.ObjectId(appointmentId),
      updateData,
      { new: true }
    );

    if (!result || result.user_id.toString() !== userId) {
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
