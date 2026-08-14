const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Service, BarberConfig } = require('../database/models');
const { requireBarber } = require('../middleware/auth');

// GET /services - List all services for the logged-in barber
router.get('/', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    
    let config = await BarberConfig.findOne({ user_id: userObjectId });
    if (!config) {
      const crypto = require('crypto');
      const token = crypto.randomBytes(10).toString('hex');
      config = new BarberConfig({
        user_id: userObjectId,
        shop_name: 'SAS Barber',
        open_time: '09:00',
        close_time: '20:00',
        slot_interval: 30,
        booking_token: token
      });
      await config.save();
    }
    const bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;

    const services = await Service.find({ user_id: userObjectId }).sort({ name: 1 });
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
router.post('/', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const { name, price, duration_min } = req.body;

  if (!name || !price) {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const services = await Service.find({ user_id: userObjectId }).sort({ name: 1 });
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
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const services = await Service.find({ user_id: userObjectId }).sort({ name: 1 });
    return res.render('services/index', {
      user: req.session.user,
      services,
      error: 'Preço inválido.',
      success: null
    });
  }

  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const service = new Service({
      user_id: userObjectId,
      name: name.trim(),
      price: priceNum,
      duration_min: durationNum
    });
    await service.save();
    res.redirect('/services?success=1');
  } catch (err) {
    console.error('Error creating service:', err);
    res.status(500).render('error', { error: 'Erro ao criar serviço.', user: req.session.user });
  }
});

// POST /services/:id/delete - Delete a service
router.post('/:id/delete', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  const serviceId = req.params.id;
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const result = await Service.deleteOne({
      _id: new mongoose.Types.ObjectId(serviceId),
      user_id: userObjectId
    });
    res.redirect('/services?success=2');
  } catch (err) {
    console.error('Error deleting service:', err);
    res.status(500).render('error', { error: 'Erro ao excluir serviço.', user: req.session.user });
  }
});

// POST /services/config - Update barber configuration (shop name, times, slot interval)
router.post('/config', requireBarber, async (req, res) => {
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
    const userObjectId = new mongoose.Types.ObjectId(userId);
    await BarberConfig.findOneAndUpdate(
      { user_id: userObjectId },
      {
        shop_name: shop_name.trim(),
        open_time,
        close_time,
        slot_interval: slotIntervalNum
      },
      { new: true }
    );
    res.redirect('/services?success=config');
  } catch (err) {
    console.error('Error updating config:', err);
    res.status(500).render('error', { error: 'Erro ao atualizar configurações da barbearia.', user: req.session.user });
  }
});

module.exports = router;
