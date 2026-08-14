const { test, beforeEach } = require('node:test');
const assert = require('node:assert');

const repo = require('../database/repository');

async function createTestBarber() {
  return repo.createUser({
    name: 'Barbeiro Teste',
    email: `barbeiro${Date.now()}@teste.com`,
    password: 'hashfake123',
    role: 'barbeiro'
  });
}

async function createTestClient() {
  return repo.createUser({
    name: 'Cliente Teste',
    email: `cliente${Date.now()}@teste.com`,
    phone: '(11) 99999-0000',
    password: 'hashfake456',
    role: 'cliente'
  });
}

async function createTestService(userId) {
  return repo.createService({
    user_id: userId,
    name: 'Corte Degradê',
    price: 45.0,
    duration_min: 30
  });
}

async function createTestAppointment(userId, overrides = {}) {
  return repo.createAppointment({
    user_id: userId,
    customer_name: 'Cliente do Barbeiro',
    customer_phone: '(11) 98888-7777',
    service_type: 'Corte',
    price: 40.0,
    status: 'Pendente',
    appointment_date: '2025-06-10T10:00:00.000Z',
    notes: '',
    ...overrides
  });
}

beforeEach(async () => {
  // Limpa todas as coleções do memory-store antes de cada teste
  const { db } = require('../database/firebase');
  if (db && typeof db._reset === 'function') {
    db._reset();
  }
});

// ==========================================================================
// USERS
// ==========================================================================

test('createUser cria um usuário com id e retorna os campos', async () => {
  const user = await repo.createUser({
    name: 'Teste',
    email: '  Teste@Email.COM  ',
    password: 'hash',
    role: 'barbeiro'
  });

  assert.ok(user.id, 'deve gerar um id');
  assert.strictEqual(user.name, 'Teste');
  assert.ok(user.created_at, 'deve ter created_at');
});

test('findUserByEmail retorna o usuário ignorando maiúsculas', async () => {
  const user = await repo.createUser({
    name: 'Maria',
    email: 'maria@teste.com',
    password: 'hash',
    role: 'barbeiro'
  });

  const found = await repo.findUserByEmail('  MARIA@Teste.COM ');
  assert.ok(found);
  assert.strictEqual(found.id, user.id);
});

test('findUserByEmail retorna null quando não existe', async () => {
  const found = await repo.findUserByEmail('naoexiste@teste.com');
  assert.strictEqual(found, null);
});

test('findUserById retorna o usuário ou null', async () => {
  const user = await repo.createUser({
    name: 'Carlos',
    email: 'carlos@teste.com',
    password: 'hash',
    role: 'cliente'
  });

  const found = await repo.findUserById(user.id);
  assert.strictEqual(found.id, user.id);

  const missing = await repo.findUserById('id-inexistente');
  assert.strictEqual(missing, null);
});

// ==========================================================================
// APPOINTMENTS
// ==========================================================================

test('createAppointment e findAppointmentById funcionam', async () => {
  const barber = await createTestBarber();
  const appointment = await createTestAppointment(barber.id);

  assert.ok(appointment.id);
  assert.strictEqual(appointment.status, 'Pendente');

  const found = await repo.findAppointmentById(appointment.id);
  assert.strictEqual(found.id, appointment.id);
  assert.strictEqual(found.customer_name, 'Cliente do Barbeiro');
});

test('findAppointments filtra por userId', async () => {
  const barber1 = await createTestBarber();
  const barber2 = await createTestBarber();

  await createTestAppointment(barber1.id);
  await createTestAppointment(barber1.id);
  await createTestAppointment(barber2.id);

  const list1 = await repo.findAppointments({ userId: barber1.id });
  assert.strictEqual(list1.length, 2);

  const list2 = await repo.findAppointments({ userId: barber2.id });
  assert.strictEqual(list2.length, 1);
});

test('findAppointments filtra por status', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Pendente' });
  await createTestAppointment(barber.id, { status: 'Finalizado' });
  await createTestAppointment(barber.id, { status: 'Cancelado' });

  const pending = await repo.findAppointments({ userId: barber.id, status: 'Pendente' });
  assert.strictEqual(pending.length, 1);
  assert.strictEqual(pending[0].status, 'Pendente');

  const all = await repo.findAppointments({ userId: barber.id });
  assert.strictEqual(all.length, 3);
});

test('findAppointments filtra por período de datas', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { appointment_date: '2025-06-10T10:00:00.000Z' });
  await createTestAppointment(barber.id, { appointment_date: '2025-07-15T14:00:00.000Z' });
  await createTestAppointment(barber.id, { appointment_date: '2025-08-20T09:00:00.000Z' });

  const inJune = await repo.findAppointments({
    userId: barber.id,
    dateStart: '2025-06-01T00:00:00',
    dateEnd: '2025-06-30T23:59:59'
  });
  assert.strictEqual(inJune.length, 1);
});

test('findAppointments filtra por nome do cliente (busca parcial)', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { customer_name: 'João Silva' });
  await createTestAppointment(barber.id, { customer_name: 'Maria Souza' });

  const result = await repo.findAppointments({ userId: barber.id, nameSearch: 'joão' });
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].customer_name, 'João Silva');
});

test('findAppointments exclui status quando excludeStatus é passado', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Agendado' });
  await createTestAppointment(barber.id, { status: 'Cancelado' });

  const active = await repo.findAppointments({ userId: barber.id, excludeStatus: 'Cancelado' });
  assert.strictEqual(active.length, 1);
  assert.strictEqual(active[0].status, 'Agendado');
});

test('findAppointments ordena por appointment_date crescente', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { appointment_date: '2025-07-01T10:00:00.000Z' });
  await createTestAppointment(barber.id, { appointment_date: '2025-06-01T10:00:00.000Z' });

  const list = await repo.findAppointments({ userId: barber.id });
  assert.strictEqual(list.length, 2);
  assert.strictEqual(list[0].appointment_date, '2025-06-01T10:00:00.000Z');
  assert.strictEqual(list[1].appointment_date, '2025-07-01T10:00:00.000Z');
});

test('findAppointmentsByOwner valida posse do agendamento', async () => {
  const barber1 = await createTestBarber();
  const barber2 = await createTestBarber();
  const appointment = await createTestAppointment(barber1.id);

  const owned = await repo.findAppointmentsByOwner(appointment.id, barber1.id);
  assert.strictEqual(owned.id, appointment.id);

  const notOwned = await repo.findAppointmentsByOwner(appointment.id, barber2.id);
  assert.strictEqual(notOwned, null);
});

test('findByIdAndUpdate atualiza o documento', async () => {
  const barber = await createTestBarber();
  const appointment = await createTestAppointment(barber.id, { status: 'Agendado' });

  const updated = await repo.findByIdAndUpdate(appointment.id, { status: 'Em Andamento' });
  assert.strictEqual(updated.status, 'Em Andamento');

  const missing = await repo.findByIdAndUpdate('id-qualquer', { status: 'X' });
  assert.strictEqual(missing, null);
});

test('deleteAppointment remove o documento', async () => {
  const barber = await createTestBarber();
  const appointment = await createTestAppointment(barber.id);

  const result = await repo.deleteAppointment(appointment.id);
  assert.strictEqual(result.deletedCount, 1);

  const missing = await repo.findAppointmentById(appointment.id);
  assert.strictEqual(missing, null);

  const again = await repo.deleteAppointment(appointment.id);
  assert.strictEqual(again.deletedCount, 0);
});

test('countAppointments conta corretamente', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id);
  await createTestAppointment(barber.id, { status: 'Finalizado' });

  const total = await repo.countAppointments({ userId: barber.id });
  assert.strictEqual(total, 2);

  const finalized = await repo.countAppointments({ userId: barber.id, status: 'Finalizado' });
  assert.strictEqual(finalized, 1);
});

// ==========================================================================
// APPOINTMENTS — CLIENTE
// ==========================================================================

test('findAppointmentsByClientId retorna apenas os agendamentos do cliente', async () => {
  const barber = await createTestBarber();
  const client = await createTestClient();

  await createTestAppointment(barber.id, { client_id: client.id });
  await createTestAppointment(barber.id, { client_id: 'outro-cliente' });

  const list = await repo.findAppointmentsByClientId(client.id);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].client_id, client.id);
});

test('findAppointmentsByPhone retorna agendamentos pelo telefone', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { customer_phone: '(11) 98888-7777' });
  await createTestAppointment(barber.id, { customer_phone: '(22) 97777-6666' });

  const list = await repo.findAppointmentsByPhone('(11) 98888-7777');
  assert.strictEqual(list.length, 1);
});

test('linkAppointmentsToClient vincula agendamentos sem client_id', async () => {
  const barber = await createTestBarber();
  const client = await createTestClient();

  await createTestAppointment(barber.id, { customer_phone: '(11) 98888-7777' });
  await createTestAppointment(barber.id, {
    customer_phone: '(11) 98888-7777',
    client_id: 'ja-vinculado'
  });

  const linked = await repo.linkAppointmentsToClient('(11) 98888-7777', client.id);
  assert.strictEqual(linked, 1);

  const list = await repo.findAppointmentsByClientId(client.id);
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].client_id, client.id);
});

// ==========================================================================
// FINANCEIRO
// ==========================================================================

test('getRevenueAndCount soma apenas finalizados no período', async () => {
  const barber = await createTestBarber();

  await createTestAppointment(barber.id, {
    status: 'Finalizado',
    price: 40,
    appointment_date: '2025-06-10T10:00:00.000Z'
  });
  await createTestAppointment(barber.id, {
    status: 'Finalizado',
    price: 65.5,
    appointment_date: '2025-06-15T10:00:00.000Z'
  });
  await createTestAppointment(barber.id, {
    status: 'Agendado',
    price: 30,
    appointment_date: '2025-06-20T10:00:00.000Z'
  });
  await createTestAppointment(barber.id, {
    status: 'Finalizado',
    price: 999,
    appointment_date: '2025-08-01T10:00:00.000Z' // fora do período
  });

  const june = await repo.getRevenueAndCount(barber.id, '2025-06-01T00:00:00', '2025-06-30T23:59:59');
  assert.strictEqual(june.count, 2);
  assert.strictEqual(june.total, 105.5);
});

test('getRevenueAllTime soma todos os finalizados', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Finalizado', price: 40 });
  await createTestAppointment(barber.id, { status: 'Finalizado', price: 60 });
  await createTestAppointment(barber.id, { status: 'Cancelado', price: 100 });

  const result = await repo.getRevenueAllTime(barber.id);
  assert.strictEqual(result.count, 2);
  assert.strictEqual(result.total, 100);
});

test('getStatusCounts conta por status', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Pendente' });
  await createTestAppointment(barber.id, { status: 'Agendado' });
  await createTestAppointment(barber.id, { status: 'Agendado' });
  await createTestAppointment(barber.id, { status: 'Finalizado' });

  const counts = await repo.getStatusCounts(barber.id);
  assert.deepStrictEqual(counts, {
    'Pendente': 1,
    'Agendado': 2,
    'Em Andamento': 0,
    'Finalizado': 1,
    'Cancelado': 0
  });
});

test('getServiceBreakdown agrupa por serviço', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Finalizado', service_type: 'Corte', price: 40 });
  await createTestAppointment(barber.id, { status: 'Finalizado', service_type: 'Corte', price: 40 });
  await createTestAppointment(barber.id, { status: 'Finalizado', service_type: 'Barba', price: 30 });

  const breakdown = await repo.getServiceBreakdown(barber.id, '2025-01-01T00:00:00', '2025-12-31T23:59:59');
  assert.strictEqual(breakdown.length, 2);

  const corte = breakdown.find(b => b.service_type === 'Corte');
  assert.strictEqual(corte.count, 2);
  assert.strictEqual(corte.total, 80);

  const barba = breakdown.find(b => b.service_type === 'Barba');
  assert.strictEqual(barba.count, 1);
  assert.strictEqual(barba.total, 30);

  // Ordenado por total decrescente
  assert.strictEqual(breakdown[0].service_type, 'Corte');
});

test('getRevenuePerDay retorna mapa de dias preenchido', async () => {
  const barber = await createTestBarber();
  await createTestAppointment(barber.id, { status: 'Finalizado', price: 50, appointment_date: '2025-06-10T10:00:00.000Z' });

  const days = ['2025-06-09', '2025-06-10', '2025-06-11'];
  const result = await repo.getRevenuePerDay(barber.id, days);

  assert.strictEqual(result.length, 3);
  assert.strictEqual(result[0].total, 0);
  assert.strictEqual(result[1].total, 50);
  assert.strictEqual(result[2].total, 0);
});

// ==========================================================================
// SERVICES
// ==========================================================================

test('createService cria serviço com preço e duração', async () => {
  const barber = await createTestBarber();
  const service = await createTestService(barber.id);

  assert.ok(service.id);
  assert.strictEqual(service.name, 'Corte Degradê');
  assert.strictEqual(service.price, 45);
  assert.strictEqual(service.duration_min, 30);
});

test('findServicesByUser retorna apenas os serviços do usuário, ordenados', async () => {
  const barber = await createTestBarber();
  const other = await createTestBarber();

  await repo.createService({ user_id: barber.id, name: 'Barba', price: 30, duration_min: 30 });
  await repo.createService({ user_id: barber.id, name: 'Corte', price: 40, duration_min: 30 });
  await repo.createService({ user_id: other.id, name: 'Outro', price: 99, duration_min: 60 });

  const services = await repo.findServicesByUser(barber.id);
  assert.strictEqual(services.length, 2);
  assert.strictEqual(services[0].name, 'Barba');
  assert.strictEqual(services[1].name, 'Corte');
});

test('findServiceById retorna o serviço ou null', async () => {
  const barber = await createTestBarber();
  const service = await createTestService(barber.id);

  const found = await repo.findServiceById(service.id);
  assert.strictEqual(found.id, service.id);

  const missing = await repo.findServiceById('inexistente');
  assert.strictEqual(missing, null);
});

test('deleteService só apaga serviço do dono', async () => {
  const barber1 = await createTestBarber();
  const barber2 = await createTestBarber();
  const service = await createTestService(barber1.id);

  const denied = await repo.deleteService(service.id, barber2.id);
  assert.strictEqual(denied.deletedCount, 0);

  const allowed = await repo.deleteService(service.id, barber1.id);
  assert.strictEqual(allowed.deletedCount, 1);
});

test('insertDefaultServices insere os 4 serviços padrão', async () => {
  const barber = await createTestBarber();
  const inserted = await repo.insertDefaultServices(barber.id);

  assert.strictEqual(inserted.length, 4);

  const services = await repo.findServicesByUser(barber.id);
  assert.strictEqual(services.length, 4);
});

// ==========================================================================
// BARBER CONFIGS
// ==========================================================================

test('createConfig e findConfigByUser funcionam', async () => {
  const barber = await createTestBarber();
  const config = await repo.createConfig({
    user_id: barber.id,
    shop_name: 'Barbearia Teste',
    open_time: '09:00',
    close_time: '20:00',
    slot_interval: 30,
    booking_token: 'token-aleatorio-1'
  });

  assert.ok(config.id);

  const found = await repo.findConfigByUser(barber.id);
  assert.strictEqual(found.id, config.id);
  assert.strictEqual(found.shop_name, 'Barbearia Teste');
});

test('findConfigByToken encontra configuração pelo token', async () => {
  const barber = await createTestBarber();
  await repo.createConfig({
    user_id: barber.id,
    shop_name: 'SAS',
    open_time: '09:00',
    close_time: '20:00',
    slot_interval: 30,
    booking_token: 'meu-token-unico'
  });

  const found = await repo.findConfigByToken('meu-token-unico');
  assert.ok(found);
  assert.strictEqual(found.booking_token, 'meu-token-unico');

  const missing = await repo.findConfigByToken('token-nao-existe');
  assert.strictEqual(missing, null);
});

test('updateConfig atualiza as configurações do usuário', async () => {
  const barber = await createTestBarber();
  await repo.createConfig({
    user_id: barber.id,
    shop_name: 'Antiga',
    open_time: '09:00',
    close_time: '18:00',
    slot_interval: 30,
    booking_token: 'token-config'
  });

  const updated = await repo.updateConfig(barber.id, { shop_name: 'Nova Loja' });
  assert.strictEqual(updated.shop_name, 'Nova Loja');

  const found = await repo.findConfigByUser(barber.id);
  assert.strictEqual(found.shop_name, 'Nova Loja');
});

test('updateConfig retorna null se o usuário não tem config', async () => {
  const barber = await createTestBarber();
  const result = await repo.updateConfig(barber.id, { shop_name: 'X' });
  assert.strictEqual(result, null);
});

test('findAnyConfig retorna a primeira config ou null', async () => {
  const missing = await repo.findAnyConfig();
  assert.strictEqual(missing, null);

  const barber = await createTestBarber();
  await repo.createConfig({
    user_id: barber.id,
    shop_name: 'SAS',
    open_time: '09:00',
    close_time: '20:00',
    slot_interval: 30,
    booking_token: 'token-any'
  });

  const found = await repo.findAnyConfig();
  assert.ok(found);
  assert.strictEqual(found.booking_token, 'token-any');
});
