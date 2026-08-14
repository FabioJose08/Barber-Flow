const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const {
  findAppointments,
  findServicesByUser,
  countServicesByUser,
  insertDefaultServices,
  findConfigByUser,
  createConfig,
  getRevenueAllTime,
  getRevenueAndCount,
  getStatusCounts
} = require('../database/repository');
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
    // Ensure barber_config exists for the user
    let config = await findConfigByUser(userId);
    if (!config) {
      const token = crypto.randomBytes(10).toString('hex');
      config = await createConfig({
        user_id: userId,
        shop_name: 'SAS Barber',
        open_time: '09:00',
        close_time: '20:00',
        slot_interval: 30,
        booking_token: token
      });
    }

    // Populate default services if none exist
    const servicesCount = await countServicesByUser(userId);
    if (servicesCount === 0) {
      await insertDefaultServices(userId);
    }

    // Build the dynamic booking URL
    const bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;

    // Get all active services for preset lists
    const services = await findServicesByUser(userId);

    // Calculate date boundaries for today
    const todayStart = `${todayStr}T00:00:00`;
    const todayEnd = `${todayStr}T23:59:59`;

    // 1. Total appointments today (any status except Cancelled)
    const todayAppointments = await findAppointments({
      userId,
      dateStart: todayStart,
      dateEnd: todayEnd,
      excludeStatus: 'Cancelado'
    });
    const todayCount = todayAppointments.length;

    // 2. Total revenue (sum of prices of 'Finalizado' status)
    const totalRev = await getRevenueAllTime(userId);
    const totalRevenue = totalRev.total;

    // 2.1 Daily revenue (sum of prices of 'Finalizado' today)
    const dailyRev = await getRevenueAndCount(userId, todayStart, todayEnd);
    const dailyRevenue = dailyRev.total;

    // 3. Status counts
    const statusStats = await getStatusCounts(userId);

    // 4. Next upcoming appointments (status = Pendente, Agendado or Em Andamento)
    const allActive = await findAppointments({
      userId,
      excludeStatus: 'Cancelado'
    });

    // Filter: Pendente always, others only if date/time is in the future
    const localDateTime = new Date(localISO).getTime();
    const upcomingAppointments = allActive
      .filter(a => {
        const apptTime = new Date(a.appointment_date).getTime();
        if (a.status === 'Pendente') return true;
        return apptTime >= localDateTime;
      })
      .sort((a, b) => new Date(a.appointment_date).getTime() - new Date(b.appointment_date).getTime())
      .slice(0, 10);

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
