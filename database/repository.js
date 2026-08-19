/**
 * Repository — Camada de acesso a dados sobre o Firestore (Firebase).
 *
 * Substitui completamente o Mongoose. Todas as rotas usam esta camada,
 * que funciona tanto com o Firestore real quanto com o memory-store
 * (modo desenvolvimento sem credenciais).
 *
 * Convenções:
 * - `user_id`, `client_id`: sempre strings (ids dos documentos)
 * - `appointment_date`, `created_at`: strings ISO (ex.: '2025-01-15T10:30:00.000Z')
 * - Cada documento retornado inclui `id` do documento
 */

const { db } = require('./firebase');
const { docToApp, docsToApp } = require('./helpers');

const COLLECTIONS = {
  USERS: 'users',
  APPOINTMENTS: 'appointments',
  SERVICES: 'services',
  BARBER_CONFIGS: 'barber_configs'
};

// ==========================================================================
// USERS
// ==========================================================================

async function createUser(data) {
  const ref = db.collection(COLLECTIONS.USERS).doc();
  const now = new Date().toISOString();
  await ref.set({
    ...data,
    created_at: now
  });
  return docToApp(await ref.get());
}

async function findUserByEmail(email) {
  const normalized = email.trim().toLowerCase();
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('email', '==', normalized)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return docToApp(snap.docs[0]);
}

async function findUserById(id) {
  const ref = db.collection(COLLECTIONS.USERS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return docToApp(snap);
}

async function findBarbers() {
  const snap = await db.collection(COLLECTIONS.USERS)
    .where('role', '==', 'barbeiro')
    .get();

  return docsToApp(snap.docs)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
}

// ==========================================================================
// APPOINTMENTS
// ==========================================================================

async function createAppointment(data) {
  const ref = db.collection(COLLECTIONS.APPOINTMENTS).doc();
  const now = new Date().toISOString();
  await ref.set({
    ...data,
    created_at: now
  });
  return docToApp(await ref.get());
}

/**
 * Busca agendamentos por filtros.
 * O memory-store suporta apenas uma condição simples por query; por isso
 * filtros compostos são aplicados em duas etapas: query básica + filtro
 * em memória.
 */
async function findAppointments({
  userId = null,
  status = null,
  dateStart = null,
  dateEnd = null,
  nameSearch = null,
  excludeStatus = null
} = {}) {
  let query = db.collection(COLLECTIONS.APPOINTMENTS);

  if (userId) {
    query = query.where('user_id', '==', userId);
  }

  let snap;
  if (status) {
    snap = await query.where('status', '==', status).get();
  } else {
    snap = await query.get();
  }

  let appointments = docsToApp(snap.docs);

  // Filtro extra em memória
  if (excludeStatus) {
    appointments = appointments.filter(a => a.status !== excludeStatus);
  }

  if (nameSearch) {
    const term = nameSearch.toLowerCase();
    appointments = appointments.filter(a => (a.customer_name || '').toLowerCase().includes(term));
  }

  if (dateStart) {
    appointments = appointments.filter(a => new Date(a.appointment_date).getTime() >= new Date(dateStart).getTime());
  }
  if (dateEnd) {
    appointments = appointments.filter(a => new Date(a.appointment_date).getTime() <= new Date(dateEnd).getTime());
  }

  // Ordenação por appointment_date crescente
  appointments.sort((a, b) => {
    const dateA = new Date(a.appointment_date).getTime();
    const dateB = new Date(b.appointment_date).getTime();
    return dateA - dateB;
  });

  return appointments;
}

async function findAppointmentById(id) {
  const ref = db.collection(COLLECTIONS.APPOINTMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return docToApp(snap);
}

async function findAppointmentsByOwner(id, userId) {
  const appointment = await findAppointmentById(id);
  if (!appointment) return null;
  if (appointment.user_id !== userId) return null;
  return appointment;
}

async function findByIdAndUpdate(id, updateData) {
  const ref = db.collection(COLLECTIONS.APPOINTMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  await ref.update(updateData);
  return docToApp(await ref.get());
}

async function deleteAppointment(id) {
  const ref = db.collection(COLLECTIONS.APPOINTMENTS).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { deletedCount: 0 };
  await ref.delete();
  return { deletedCount: 1 };
}

async function countAppointments({ userId, status = null, dateStart = null, dateEnd = null, excludeStatus = null } = {}) {
  const list = await findAppointments({ userId, status, dateStart, dateEnd, excludeStatus });
  return list.length;
}

// ==========================================================================
// APPOINTMENTS — Cliente
// ==========================================================================

async function findAppointmentsByClientId(clientId) {
  const snap = await db.collection(COLLECTIONS.APPOINTMENTS)
    .where('client_id', '==', clientId)
    .get();

  const appointments = docsToApp(snap.docs);
  appointments.sort((a, b) => {
    const dateA = new Date(a.appointment_date).getTime();
    const dateB = new Date(b.appointment_date).getTime();
    return dateB - dateA;
  });
  return appointments;
}

async function findAppointmentsByPhone(phone) {
  const snap = await db.collection(COLLECTIONS.APPOINTMENTS)
    .where('customer_phone', '==', phone)
    .get();

  const appointments = docsToApp(snap.docs);
  appointments.sort((a, b) => {
    const dateA = new Date(a.appointment_date).getTime();
    const dateB = new Date(b.appointment_date).getTime();
    return dateB - dateA;
  });
  return appointments;
}

async function linkAppointmentsToClient(phone, clientId) {
  const snap = await db.collection(COLLECTIONS.APPOINTMENTS)
    .where('customer_phone', '==', phone)
    .get();

  const writes = [];
  snap.docs.forEach((doc) => {
    const data = doc.data() || {};
    if (!data.client_id) {
      writes.push(doc.ref.update({ client_id: clientId }));
    }
  });

  await Promise.all(writes);
  return writes.length;
}

// ==========================================================================
// APPOINTMENTS — Agregações financeiras (em memória)
// ==========================================================================

async function getFinalizedBetween(userId, startISO, endISO) {
  const list = await findAppointments({ userId, status: 'Finalizado' });
  return list.filter(a => {
    const date = new Date(a.appointment_date).getTime();
    const start = new Date(startISO).getTime();
    const end = new Date(endISO).getTime();
    return date >= start && date <= end;
  });
}

async function getRevenueAndCount(userId, startISO, endISO) {
  const list = await getFinalizedBetween(userId, startISO, endISO);
  const total = list.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
  return { total, count: list.length };
}

async function getRevenueAllTime(userId) {
  const list = await findAppointments({ userId, status: 'Finalizado' });
  const total = list.reduce((sum, a) => sum + (parseFloat(a.price) || 0), 0);
  return { total, count: list.length };
}

async function getStatusCounts(userId) {
  const list = await findAppointments({ userId });
  const counts = {
    'Pendente': 0,
    'Agendado': 0,
    'Em Andamento': 0,
    'Finalizado': 0,
    'Cancelado': 0
  };
  list.forEach(a => {
    if (counts[a.status] !== undefined) counts[a.status] += 1;
  });
  return counts;
}

async function getServiceBreakdown(userId, startISO, endISO) {
  const list = await getFinalizedBetween(userId, startISO, endISO);
  const map = {};
  list.forEach(a => {
    const key = a.service_type || 'Outros';
    if (!map[key]) map[key] = { service_type: key, count: 0, total: 0 };
    map[key].count += 1;
    map[key].total += parseFloat(a.price) || 0;
  });
  return Object.values(map).sort((x, y) => y.total - x.total);
}

async function getRevenuePerDay(userId, days) {
  // days: array de strings 'YYYY-MM-DD'
  const start = `${days[0]}T00:00:00`;
  const end = `${days[days.length - 1]}T23:59:59`;
  const list = await getFinalizedBetween(userId, start, end);

  const map = {};
  days.forEach(d => { map[d] = 0; });

  list.forEach(a => {
    const dayKey = (a.appointment_date || '').slice(0, 10);
    if (map[dayKey] !== undefined) {
      map[dayKey] += parseFloat(a.price) || 0;
    }
  });

  return days.map(day => ({ day, total: map[day] }));
}

// ==========================================================================
// SERVICES
// ==========================================================================

async function createService(data) {
  const ref = db.collection(COLLECTIONS.SERVICES).doc();
  const now = new Date().toISOString();
  await ref.set({
    ...data,
    created_at: now
  });
  return docToApp(await ref.get());
}

async function findServicesByUser(userId) {
  const snap = await db.collection(COLLECTIONS.SERVICES)
    .where('user_id', '==', userId)
    .get();

  const services = docsToApp(snap.docs);
  services.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return services;
}

async function findServiceById(id) {
  const ref = db.collection(COLLECTIONS.SERVICES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  return docToApp(snap);
}

async function countServicesByUser(userId) {
  const list = await findServicesByUser(userId);
  return list.length;
}

async function deleteService(id, userId) {
  const ref = db.collection(COLLECTIONS.SERVICES).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return { deletedCount: 0 };
  const data = snap.data() || {};
  if (data.user_id !== userId) return { deletedCount: 0 };
  await ref.delete();
  return { deletedCount: 1 };
}

async function insertDefaultServices(userId) {
  const defaults = [
    { name: 'Corte', price: 40.00, duration_min: 30 },
    { name: 'Barba', price: 30.00, duration_min: 30 },
    { name: 'Pigmentação', price: 25.00, duration_min: 30 },
    { name: 'Corte & Barba', price: 65.00, duration_min: 60 }
  ];
  const results = [];
  for (const svc of defaults) {
    results.push(await createService({ user_id: userId, ...svc }));
  }
  return results;
}

// ==========================================================================
// BARBER CONFIGS
// ==========================================================================

async function findConfigByUser(userId) {
  const snap = await db.collection(COLLECTIONS.BARBER_CONFIGS)
    .where('user_id', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return docToApp(snap.docs[0]);
}

async function findConfigByToken(token) {
  const snap = await db.collection(COLLECTIONS.BARBER_CONFIGS)
    .where('booking_token', '==', token)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return docToApp(snap.docs[0]);
}

async function findAnyConfig() {
  const snap = await db.collection(COLLECTIONS.BARBER_CONFIGS).limit(1).get();
  if (snap.empty) return null;
  return docToApp(snap.docs[0]);
}

async function createConfig(data) {
  const ref = db.collection(COLLECTIONS.BARBER_CONFIGS).doc();
  const now = new Date().toISOString();
  await ref.set({
    ...data,
    created_at: now
  });
  return docToApp(await ref.get());
}

async function updateConfig(userId, data) {
  const snap = await db.collection(COLLECTIONS.BARBER_CONFIGS)
    .where('user_id', '==', userId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  const ref = snap.docs[0].ref;
  await ref.update(data);
  return docToApp(await ref.get());
}

module.exports = {
  COLLECTIONS,

  // Users
  createUser,
  findUserByEmail,
  findUserById,
  findBarbers,

  // Appointments
  createAppointment,
  findAppointments,
  findAppointmentById,
  findAppointmentsByOwner,
  findByIdAndUpdate,
  deleteAppointment,
  countAppointments,

  // Appointments — Cliente
  findAppointmentsByClientId,
  findAppointmentsByPhone,
  linkAppointmentsToClient,

  // Appointments — Financeiro
  getFinalizedBetween,
  getRevenueAndCount,
  getRevenueAllTime,
  getStatusCounts,
  getServiceBreakdown,
  getRevenuePerDay,

  // Services
  createService,
  findServiceById,
  findServicesByUser,
  countServicesByUser,
  deleteService,
  insertDefaultServices,

  // Barber Configs
  findConfigByUser,
  findConfigByToken,
  findAnyConfig,
  createConfig,
  updateConfig
};
