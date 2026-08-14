const express = require('express');
const router = express.Router();
const db = require('../database/db');
const { requireBarber } = require('../middleware/auth');

router.get('/financial', requireBarber, (req, res) => {
  const userId = req.session.user.id;

  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  const localNow = new Date(now.getTime() - offset);

  const todayStr = localNow.toISOString().slice(0, 10);

  // Week boundaries (Monday to Sunday)
  const dayOfWeek = localNow.getDay(); // 0=Sun
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(localNow);
  monday.setDate(localNow.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekStart = monday.toISOString().slice(0, 10);
  const weekEnd = sunday.toISOString().slice(0, 10);

  // Month boundaries
  const monthStart = `${localNow.getFullYear()}-${String(localNow.getMonth() + 1).padStart(2, '0')}-01`;
  const nextMonth = new Date(localNow.getFullYear(), localNow.getMonth() + 1, 1);
  const nextMonthStr = new Date(nextMonth.getTime() - offset).toISOString().slice(0, 10);

  // Period filter from query
  const period = req.query.period || 'month';
  let filterStart, filterEnd, filterLabel;

  if (period === 'today') {
    filterStart = todayStr;
    filterEnd = todayStr;
    filterLabel = 'Hoje';
  } else if (period === 'week') {
    filterStart = weekStart;
    filterEnd = weekEnd;
    filterLabel = 'Esta Semana';
  } else if (period === 'month') {
    filterStart = monthStart;
    filterEnd = nextMonthStr;
    filterLabel = 'Este Mês';
  } else if (period === 'custom' && req.query.start && req.query.end) {
    filterStart = req.query.start;
    filterEnd = req.query.end;
    filterLabel = `${filterStart} até ${filterEnd}`;
  } else {
    filterStart = monthStart;
    filterEnd = nextMonthStr;
    filterLabel = 'Este Mês';
  }

  try {
    // Revenue today
    const todayRevStmt = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as count
      FROM appointments WHERE user_id = ? AND status = 'Finalizado' AND appointment_date LIKE ?
    `);
    const todayRev = todayRevStmt.get(userId, `${todayStr}%`);

    // Revenue this week
    const weekRevStmt = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as count
      FROM appointments WHERE user_id = ? AND status = 'Finalizado'
      AND appointment_date >= ? AND appointment_date <= ?
    `);
    const weekRev = weekRevStmt.get(userId, `${weekStart}T00:00`, `${weekEnd}T23:59`);

    // Revenue this month
    const monthRevStmt = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as count
      FROM appointments WHERE user_id = ? AND status = 'Finalizado'
      AND appointment_date >= ? AND appointment_date < ?
    `);
    const monthRev = monthRevStmt.get(userId, `${monthStart}T00:00`, `${nextMonthStr}T00:00`);

    // Revenue total (all time)
    const totalRevStmt = db.prepare(`
      SELECT COALESCE(SUM(price), 0) as total, COUNT(*) as count
      FROM appointments WHERE user_id = ? AND status = 'Finalizado'
    `);
    const totalRev = totalRevStmt.get(userId);

    // Filtered detailed appointments list
    const detailStmt = db.prepare(`
      SELECT * FROM appointments
      WHERE user_id = ? AND status = 'Finalizado'
      AND appointment_date >= ? AND appointment_date <= ?
      ORDER BY appointment_date DESC
    `);
    const detailAppointments = detailStmt.all(userId, `${filterStart}T00:00`, `${filterEnd}T23:59`);

    // Revenue per service (filtered period)
    const serviceBreakdownStmt = db.prepare(`
      SELECT service_type, COUNT(*) as count, SUM(price) as total
      FROM appointments
      WHERE user_id = ? AND status = 'Finalizado'
      AND appointment_date >= ? AND appointment_date <= ?
      GROUP BY service_type
      ORDER BY total DESC
    `);
    const serviceBreakdown = serviceBreakdownStmt.all(userId, `${filterStart}T00:00`, `${filterEnd}T23:59`);

    // Revenue per day (last 7 days) for mini chart
    const dailyStmt = db.prepare(`
      SELECT DATE(appointment_date) as day, COALESCE(SUM(price), 0) as total
      FROM appointments
      WHERE user_id = ? AND status = 'Finalizado'
      AND appointment_date >= ? AND appointment_date <= ?
      GROUP BY day ORDER BY day ASC
    `);

    // Build last 7 days array
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(localNow);
      d.setDate(localNow.getDate() - i);
      last7Days.push(d.toISOString().slice(0, 10));
    }
    const dailyRaw = dailyStmt.all(userId,
      `${last7Days[0]}T00:00`,
      `${last7Days[6]}T23:59`
    );
    const dailyMap = {};
    dailyRaw.forEach(r => { dailyMap[r.day] = r.total; });
    const chartData = last7Days.map(d => ({
      day: d,
      label: new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
      total: dailyMap[d] || 0
    }));
    const chartMax = Math.max(...chartData.map(d => d.total), 1);

    // Pending count for badge
    const pendingStmt = db.prepare(`SELECT COUNT(*) as count FROM appointments WHERE user_id = ? AND status = 'Pendente'`);
    const pendingResult = pendingStmt.get(userId);
    const pendingCount = pendingResult ? pendingResult.count : 0;

    res.render('financial/index', {
      user: req.session.user,
      todayRev,
      weekRev,
      monthRev,
      totalRev,
      detailAppointments,
      serviceBreakdown,
      chartData,
      chartMax,
      period,
      filterLabel,
      filterStart,
      filterEnd,
      pendingCount
    });
  } catch (err) {
    console.error('Error loading financial report:', err);
    res.status(500).render('error', { error: 'Erro ao carregar relatório financeiro.', user: req.session.user });
  }
});

module.exports = router;
