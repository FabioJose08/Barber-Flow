const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Appointment, Service, BarberConfig } = require('../database/models');
const { requireBarber } = require('../middleware/auth');

router.get('/dashboard', requireBarber, async (req, res) => {
  const userId = req.session.user.id;
  
  // Get today's local date YYYY-MM-DD
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const todayStr = `${year}-${month}-${day}`;
  
  // Format current local date time (YYYY-MM-DDTHH:MM)
  const offset = now.getTimezoneOffset() * 60000;
  const localISO = new Date(now.getTime() - offset).toISOString().slice(0, 16);
  
  try {
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Ensure barber_config exists for the user
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

    // Populate default services if none exist
    const servicesCount = await Service.countDocuments({ user_id: userObjectId });
    if (servicesCount === 0) {
      await Service.insertMany([
        { user_id: userObjectId, name: 'Corte', price: 40.00, duration_min: 30 },
        { user_id: userObjectId, name: 'Barba', price: 30.00, duration_min: 30 },
        { user_id: userObjectId, name: 'Pigmentação', price: 25.00, duration_min: 30 },
        { user_id: userObjectId, name: 'Corte & Barba', price: 65.00, duration_min: 60 }
      ]);
    }

    // Build the dynamic booking URL
    const bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;

    // Get all active services for preset lists
    const services = await Service.find({ user_id: userObjectId }).sort({ name: 1 });

    // Calculate date boundaries for today
    const todayStart = new Date(`${todayStr}T00:00:00`);
    const todayEnd = new Date(`${todayStr}T23:59:59`);

    // 1. Total appointments today (any status except Cancelled)
    const todayCount = await Appointment.countDocuments({
      user_id: userObjectId,
      appointment_date: { $gte: todayStart, $lte: todayEnd },
      status: { $ne: 'Cancelado' }
    });
    
    // 2. Total revenue (sum of prices of 'Finalizado' status)
    const revenueResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);
    const totalRevenue = revenueResult.length > 0 ? parseFloat(revenueResult[0].total) : 0;
    
    // 2.1 Daily revenue (sum of prices of 'Finalizado' today)
    const dailyRevenueResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado',
          appointment_date: { $gte: todayStart, $lte: todayEnd }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' }
        }
      }
    ]);
    const dailyRevenue = dailyRevenueResult.length > 0 ? parseFloat(dailyRevenueResult[0].total) : 0;
    
    // 3. Status counts
    const statusCountsResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId
        }
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    const statusStats = {
      'Pendente': 0,
      'Agendado': 0,
      'Em Andamento': 0,
      'Finalizado': 0,
      'Cancelado': 0
    };
    
    statusCountsResult.forEach(row => {
      if (statusStats[row._id] !== undefined) {
        statusStats[row._id] = row.count;
      }
    });
    
    // 4. Next upcoming appointments (status = Pendente, Agendado or Em Andamento)
    const localDateTime = new Date(localISO);
    const upcomingAppointments = await Appointment.find({
      user_id: userObjectId,
      $or: [
        { status: 'Pendente' },
        {
          status: { $in: ['Agendado', 'Em Andamento'] },
          appointment_date: { $gte: localDateTime }
        }
      ]
    }).sort({ appointment_date: 1 }).limit(10);
    
    res.render('dashboard', {
      user: req.session.user,
      todayCount,
      totalRevenue,
      dailyRevenue,
      statusStats,
      upcomingAppointments,
      todayStr,
      bookingUrl,
      config,
      services
    });
  } catch (err) {
    console.error('Error rendering dashboard:', err);
    res.status(500).render('error', { 
      error: 'Erro interno ao processar dados do painel.', 
      user: req.session.user 
    });
  }
});

module.exports = router;
