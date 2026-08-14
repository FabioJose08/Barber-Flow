const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { Appointment } = require('../database/models');
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
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const todayStart = new Date(`${todayStr}T00:00:00`);
    const todayEnd = new Date(`${todayStr}T23:59:59`);
    const weekStartDate = new Date(`${weekStart}T00:00:00`);
    const weekEndDate = new Date(`${weekEnd}T23:59:59`);
    const monthStartDate = new Date(`${monthStart}T00:00:00`);
    const nextMonthDate = new Date(`${nextMonthStr}T00:00:00`);
    const filterStartDate = new Date(`${filterStart}T00:00:00`);
    const filterEndDate = new Date(`${filterEnd}T23:59:59`);

    // Revenue today
    const todayRevResult = await Appointment.aggregate([
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
          total: { $sum: '$price' },
          count: { $sum: 1 }
        }
      }
    ]);
    const todayRev = todayRevResult.length > 0 ? todayRevResult[0] : { total: 0, count: 0 };

    // Revenue this week
    const weekRevResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado',
          appointment_date: { $gte: weekStartDate, $lte: weekEndDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          count: { $sum: 1 }
        }
      }
    ]);
    const weekRev = weekRevResult.length > 0 ? weekRevResult[0] : { total: 0, count: 0 };

    // Revenue this month
    const monthRevResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado',
          appointment_date: { $gte: monthStartDate, $lt: nextMonthDate }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          count: { $sum: 1 }
        }
      }
    ]);
    const monthRev = monthRevResult.length > 0 ? monthRevResult[0] : { total: 0, count: 0 };

    // Revenue total (all time)
    const totalRevResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado'
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$price' },
          count: { $sum: 1 }
        }
      }
    ]);
    const totalRev = totalRevResult.length > 0 ? totalRevResult[0] : { total: 0, count: 0 };

    // Filtered detailed appointments list
    const detailAppointments = await Appointment.find({
      user_id: userObjectId,
      status: 'Finalizado',
      appointment_date: { $gte: filterStartDate, $lte: filterEndDate }
    }).sort({ appointment_date: -1 });

    // Revenue per service (filtered period)
    const serviceBreakdownResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado',
          appointment_date: { $gte: filterStartDate, $lte: filterEndDate }
        }
      },
      {
        $group: {
          _id: '$service_type',
          count: { $sum: 1 },
          total: { $sum: '$price' }
        }
      },
      {
        $sort: { total: -1 }
      }
    ]);
    const serviceBreakdown = serviceBreakdownResult;

    // Revenue per day (last 7 days) for mini chart
    const last7Days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(localNow);
      d.setDate(localNow.getDate() - i);
      last7Days.push(d.toISOString().slice(0, 10));
    }

    const dailyRevenueResult = await Appointment.aggregate([
      {
        $match: {
          user_id: userObjectId,
          status: 'Finalizado',
          appointment_date: {
            $gte: new Date(`${last7Days[0]}T00:00:00`),
            $lte: new Date(`${last7Days[6]}T23:59:59`)
          }
        }
      },
      {
        $group: {
          _id: {
            $dateToString: {
              format: '%Y-%m-%d',
              date: '$appointment_date'
            }
          },
          total: { $sum: '$price' }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const dailyMap = {};
    dailyRevenueResult.forEach(r => {
      dailyMap[r._id] = r.total;
    });
    
    const chartData = last7Days.map(d => ({
      day: d,
      label: new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit' }),
      total: dailyMap[d] || 0
    }));
    const chartMax = Math.max(...chartData.map(d => d.total), 1);

    // Pending count for badge
    const pendingCount = await Appointment.countDocuments({
      user_id: userObjectId,
      status: 'Pendente'
    });

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
