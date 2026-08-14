const express = require('express');
const router = express.Router();
const {
  findAppointments,
  getRevenueAndCount,
  getRevenueAllTime,
  getServiceBreakdown,
  getRevenuePerDay
} = require('../database/repository');
const { requireBarber } = require('../middleware/auth');

router.get('/financial', requireBarber, async (req, res) => {
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
    const todayStart = `${todayStr}T00:00:00`;
    const todayEnd = `${todayStr}T23:59:59`;
    const weekStartDate = `${weekStart}T00:00:00`;
    const weekEndDate = `${weekEnd}T23:59:59`;
    const monthStartDate = `${monthStart}T00:00:00`;
    const nextMonthDate = `${nextMonthStr}T00:00:00`;
    const filterStartDate = `${filterStart}T00:00:00`;
    const filterEndDate = `${filterEnd}T23:59:59`;

    // Revenue today
    const todayRev = await getRevenueAndCount(userId, todayStart, todayEnd);

    // Revenue this week
    const weekRev = await getRevenueAndCount(userId, weekStartDate, weekEndDate);

    // Revenue this month
    const monthRev = await getRevenueAndCount(userId, monthStartDate, nextMonthDate);

    // Revenue total (all time)
    const totalRev = await getRevenueAllTime(userId);

    // Filtered detailed appointments list
    const filteredAppointments = await findAppointments({
      userId,
      status: 'Finalizado',
      dateStart: filterStartDate,
      dateEnd: filterEndDate
    });
    const detailAppointments = filteredAppointments.sort((a, b) => {
      const dateA = new Date(a.appointment_date).getTime();
      const dateB = new Date(b.appointment_date).getTime();
      return dateB - dateA;
    });

    // Revenue per service (filtered period)
    const serviceBreakdown = await getServiceBreakdown(userId, filterStartDate, filterEndDate);

    // Revenue per day (last 7 days) for mini chart
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(localNow);
      d.setDate(localNow.getDate() - i);
      last7Days.push(d.toISOString().slice(0, 10));
    }

    const dailyRevenue = await getRevenuePerDay(userId, last7Days);

    const dailyMap = {};
    dailyRevenue.forEach(r => {
      dailyMap[r.day] = r.total;
    });

    const chartData = last7Days.map(d => ({
      day: d,
      label: new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
      total: dailyMap[d] || 0
    }));
    const chartMax = Math.max(...chartData.map(d => d.total), 1);

    // Pending count for badge
    const pendingAppointments = await findAppointments({ userId, status: 'Pendente' });
    const pendingCount = pendingAppointments.length;

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
