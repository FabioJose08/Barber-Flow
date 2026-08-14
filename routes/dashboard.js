const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireBarber } = require('../middleware/auth');

router.get('/dashboard', requireBarber, (req, res) => {
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

    // Populate default services if none exist
    const servicesCountResult = db.prepare('SELECT COUNT(*) as count FROM services WHERE user_id = ?').get(userId);
    const servicesCount = servicesCountResult ? servicesCountResult.count : 0;
    if (servicesCount === 0) {
      const insertService = db.prepare('INSERT INTO services (user_id, name, price, duration_min) VALUES (?, ?, ?, ?)');
      insertService.run(userId, 'Corte', 40.00, 30);
      insertService.run(userId, 'Barba', 30.00, 30);
      insertService.run(userId, 'Pigmentação', 25.00, 30);
      insertService.run(userId, 'Corte & Barba', 65.00, 60);
    }

    // Build the dynamic booking URL
    const bookingUrl = `${req.protocol}://${req.get('host')}/book/${config.booking_token}`;

    // Get all active services for preset lists
    const servicesStmt = db.prepare('SELECT * FROM services WHERE user_id = ? ORDER BY name ASC');
    const services = servicesStmt.all(userId);

    // 1. Total appointments today (any status except Cancelled)
    const todayCountStmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM appointments 
      WHERE user_id = ? AND appointment_date LIKE ? AND status != 'Cancelado'
    `);
    const todayCountResult = todayCountStmt.get(userId, `${todayStr}%`);
    const todayCount = todayCountResult ? todayCountResult.count : 0;
    
    // 2. Total revenue (sum of prices of 'Finalizado' status)
    const revenueStmt = db.prepare(`
      SELECT SUM(price) as total 
      FROM appointments 
      WHERE user_id = ? AND status = 'Finalizado'
    `);
    const revenueResult = revenueStmt.get(userId);
    const totalRevenue = revenueResult && revenueResult.total ? parseFloat(revenueResult.total) : 0;
    
    // 2.1 Daily revenue (sum of prices of 'Finalizado' today)
    const dailyRevenueStmt = db.prepare(`
      SELECT SUM(price) as total 
      FROM appointments 
      WHERE user_id = ? AND status = 'Finalizado' AND appointment_date LIKE ?
    `);
    const dailyRevenueResult = dailyRevenueStmt.get(userId, `${todayStr}%`);
    const dailyRevenue = dailyRevenueResult && dailyRevenueResult.total ? parseFloat(dailyRevenueResult.total) : 0;
    
    // 3. Status counts
    const statusCountsStmt = db.prepare(`
      SELECT status, COUNT(*) as count 
      FROM appointments 
      WHERE user_id = ? 
      GROUP BY status
    `);
    const statusCountsResult = statusCountsStmt.all(userId);
    
    const statusStats = {
      'Pendente': 0,
      'Agendado': 0,
      'Em Andamento': 0,
      'Finalizado': 0,
      'Cancelado': 0
    };
    
    statusCountsResult.forEach(row => {
      const statusName = row.status;
      if (statusStats[statusName] !== undefined) {
        statusStats[statusName] = row.count;
      }
    });
    
    // 4. Next upcoming appointments (status = Pendente, Agendado or Em Andamento)
    const upcomingStmt = db.prepare(`
      SELECT * 
      FROM appointments 
      WHERE user_id = ? AND (status = 'Pendente' OR (status IN ('Agendado', 'Em Andamento') AND appointment_date >= ?))
      ORDER BY appointment_date ASC 
      LIMIT 10
    `);
    const upcomingAppointments = upcomingStmt.all(userId, localISO);
    
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
