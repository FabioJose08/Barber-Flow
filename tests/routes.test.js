const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');
const bcrypt = require('bcrypt');

const app = require('../app');
const repo = require('../database/repository');

before(async () => {
  const { db } = require('../database/firebase');
  if (db && typeof db._reset === 'function') {
    db._reset();
  }
});

function agent() {
  return request.agent(app);
}

async function createBarber(prefix) {
  const email = `${prefix}${Date.now()}@teste.com`;
  const barber = await repo.createUser({
    name: `Barbeiro ${prefix}`,
    email,
    password: await bcrypt.hash('senha123', 10),
    role: 'barbeiro'
  });
  return { barber, email };
}

async function createClientUser(prefix) {
  const email = `${prefix}${Date.now()}@teste.com`;
  const client = await repo.createUser({
    name: `Cliente ${prefix}`,
    email,
    phone: '(11) 90000-0000',
    password: await bcrypt.hash('senha123', 10),
    role: 'cliente'
  });
  return { client, email };
}

async function createConfigFor(userId, token) {
  return repo.createConfig({
    user_id: userId,
    shop_name: 'Barbearia Teste',
    open_time: '09:00',
    close_time: '18:00',
    slot_interval: 60,
    booking_token: token
  });
}

test('GET /login renderiza a pagina de login', async () => {
  const res = await request(app).get('/login');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Login/i);
});

test('GET /register renderiza a pagina de cadastro', async () => {
  const res = await request(app).get('/register');
  assert.strictEqual(res.status, 200);
});

test('POST /register cria barbeiro, loga e redireciona para /dashboard', async () => {
  const res = await agent()
    .post('/register')
    .type('form')
    .send({
      name: 'Barbeiro Integracao',
      email: `barbeiro-it${Date.now()}@teste.com`,
      password: 'senha123',
      confirmPassword: 'senha123'
    });

  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/dashboard');
});

test('POST /register rejeita senhas diferentes', async () => {
  const res = await agent()
    .post('/register')
    .type('form')
    .send({
      name: 'Teste',
      email: `invalido${Date.now()}@teste.com`,
      password: 'senha123',
      confirmPassword: 'senha456'
    });

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /senhas n[ãa]o coincidem/i);
});

test('POST /register rejeita senha curta demais', async () => {
  const res = await agent()
    .post('/register')
    .type('form')
    .send({
      name: 'Teste',
      email: `curta${Date.now()}@teste.com`,
      password: '123',
      confirmPassword: '123'
    });

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /pelo menos 6 caracteres/i);
});

test('POST /register rejeita e-mail duplicado', async () => {
  const email = `duplicado${Date.now()}@teste.com`;

  await agent().post('/register').type('form').send({
    name: 'Primeiro',
    email,
    password: 'senha123',
    confirmPassword: 'senha123'
  });

  const res = await agent().post('/register').type('form').send({
    name: 'Segundo',
    email,
    password: 'senha123',
    confirmPassword: 'senha123'
  });

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /j[áa] est[áa] cadastrado/i);
});

test('POST /login autentica barbeiro existente', async () => {
  const { email } = await createBarber('login');

  const res = await agent()
    .post('/login')
    .type('form')
    .send({ email, password: 'senha123' });

  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/dashboard');
});

test('POST /login rejeita senha incorreta', async () => {
  const { email } = await createBarber('errada');

  const res = await agent()
    .post('/login')
    .type('form')
    .send({ email, password: 'senha-errada' });

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /E-mail ou senha incorretos/i);
});

test('GET /dashboard sem sessao redireciona para /login', async () => {
  const res = await request(app).get('/dashboard');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /dashboard com sessao de barbeiro carrega painel', async () => {
  const { email } = await createBarber('dash');

  const client = agent();
  const loginRes = await client
    .post('/login')
    .type('form')
    .send({ email, password: 'senha123' });
  assert.strictEqual(loginRes.status, 302);

  const res = await client.get('/dashboard');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /BarberFlow/i);
});

test('Cliente nao acessa area de barbeiro', async () => {
  const { email } = await createClientUser('block');

  const client = agent();
  await client
    .post('/client/login')
    .type('form')
    .send({ email, password: 'senha123' });

  const res = await client.get('/dashboard');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/client/dashboard');
});

test('POST /appointments cria agendamento para barbeiro logado', async () => {
  const { barber, email } = await createBarber('appt');
  await createConfigFor(barber.id, `token-appt-${Date.now()}`);

  const client = agent();
  await client.post('/login').type('form').send({ email, password: 'senha123' });

  const before = await repo.countAppointments({ userId: barber.id });
  assert.strictEqual(before, 0);

  const res = await client
    .post('/appointments')
    .type('form')
    .send({
      customer_name: 'Cliente Novo',
      customer_phone: '(11) 91111-2222',
      service_type: 'Corte',
      price: '40',
      status: 'Agendado',
      appointment_date: '2026-09-01T10:00',
      notes: ''
    });

  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/appointments');

  const after = await repo.countAppointments({ userId: barber.id });
  assert.strictEqual(after, 1);
});

test('POST /appointments sem sessao redireciona para login', async () => {
  const res = await request(app)
    .post('/appointments')
    .type('form')
    .send({ customer_name: 'X' });

  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /book/:token renderiza pagina publica de agendamento', async () => {
  const { barber } = await createBarber('book');
  const token = `public-token-${Date.now()}`;
  await createConfigFor(barber.id, token);
  await repo.createService({
    user_id: barber.id,
    name: 'Corte',
    price: 40,
    duration_min: 30
  });

  const res = await request(app).get(`/book/${token}`);
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Barbearia Teste/i);
  assert.match(res.text, /Corte/i);
});

test('GET /book/:token invalido retorna 404', async () => {
  const res = await request(app).get('/book/token-inexistente');
  assert.strictEqual(res.status, 404);
});

test('POST /book/:token cria agendamento Pendente via link publico', async () => {
  const { barber } = await createBarber('submit');
  const token = `submit-token-${Date.now()}`;
  await createConfigFor(barber.id, token);
  const service = await repo.createService({
    user_id: barber.id,
    name: 'Barba',
    price: 30,
    duration_min: 30
  });

  const res = await request(app)
    .post(`/book/${token}`)
    .type('form')
    .send({
      customer_name: 'Joao Publico',
      customer_phone: '(11) 99999-8888',
      service_id: service.id,
      appointment_date: '2026-10-05',
      time_slot: '10:00',
      notes: ''
    });

  assert.strictEqual(res.status, 302);
  assert.match(res.headers.location, /success/);

  const appts = await repo.findAppointments({ userId: barber.id, status: 'Pendente' });
  assert.strictEqual(appts.length, 1);
  assert.strictEqual(appts[0].customer_name, 'Joao Publico');
  assert.strictEqual(appts[0].service_type, 'Barba');
  assert.strictEqual(appts[0].price, 30);
});

test('POST /book/:token rejeita horario ja reservado', async () => {
  const { barber } = await createBarber('conflict');
  const token = `conflict-token-${Date.now()}`;
  await createConfigFor(barber.id, token);
  const service = await repo.createService({
    user_id: barber.id,
    name: 'Corte',
    price: 40,
    duration_min: 30
  });

  // O horário armazenado deve refletir a mesma conversão local->ISO da rota
  await repo.createAppointment({
    user_id: barber.id,
    customer_name: 'Primeiro Cliente',
    customer_phone: '(11) 11111-1111',
    service_type: 'Corte',
    price: 40,
    status: 'Agendado',
    appointment_date: new Date('2026-10-05T10:00').toISOString()
  });

  const res = await request(app)
    .post(`/book/${token}`)
    .type('form')
    .send({
      customer_name: 'Segundo Cliente',
      customer_phone: '(11) 22222-2222',
      service_id: service.id,
      appointment_date: '2026-10-05',
      time_slot: '10:00',
      notes: ''
    });

  assert.strictEqual(res.status, 200);
  assert.match(res.text, /j[áa] foi reservado/i);
});

test('GET /book/:token/slots retorna horarios disponiveis', async () => {
  const { barber } = await createBarber('slots');
  const token = `slots-token-${Date.now()}`;
  await createConfigFor(barber.id, token);

  const res = await request(app).get(`/book/${token}/slots?date=2026-10-05`);
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body, { slots: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'] });
});

test('GET /financial sem sessao redireciona para login', async () => {
  const res = await request(app).get('/financial');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /services sem sessao redireciona para login', async () => {
  const res = await request(app).get('/services');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET /appointments sem sessao redireciona para login', async () => {
  const res = await request(app).get('/appointments');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('GET / rota raiz redireciona para /login quando nao autenticado', async () => {
  const res = await request(app).get('/');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('Pagina inexistente retorna 404', async () => {
  const res = await request(app).get('/pagina-que-nao-existe');
  assert.strictEqual(res.status, 404);
});
