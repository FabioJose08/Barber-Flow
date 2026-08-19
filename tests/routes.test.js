const { test, before } = require('node:test');
const assert = require('node:assert');
const request = require('supertest');

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
    password: null,
    role: 'barbeiro',
    auth_provider: 'google'
  });
  return { barber, email };
}

async function createClientUser(prefix) {
  const email = `${prefix}${Date.now()}@teste.com`;
  const client = await repo.createUser({
    name: `Cliente ${prefix}`,
    email,
    phone: '(11) 90000-0000',
    password: null,
    role: 'cliente',
    auth_provider: 'google'
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

/**
 * Simula login criando sessão diretamente via supertest cookie jar.
 * Como a autenticação agora é Google-only, não há rota POST /login com form.
 * Usamos uma abordagem de injetar sessão via a rota POST /auth/google
 * testando a resposta de erro quando sem token, e para testes que precisam
 * de sessão ativa, verificamos os endpoints que não requerem auth.
 */

// ==========================================
// TESTES DE ROTAS PÚBLICAS
// ==========================================

test('GET /login renderiza a pagina de login com botao Google', async () => {
  const res = await request(app).get('/login');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Entrar com Google/i);
});

test('GET /register renderiza o cadastro do barbeiro', async () => {
  const res = await request(app).get('/register');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Nome completo/i);
});

test('GET /client/login renderiza a pagina de login do cliente', async () => {
  const res = await request(app).get('/client/login');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Entrar com Google/i);
});

test('GET /client/register renderiza o cadastro do cliente', async () => {
  const res = await request(app).get('/client/register');
  assert.strictEqual(res.status, 200);
  assert.match(res.text, /Cadastro de Cliente/i);
});

// ==========================================
// TESTES DE AUTENTICAÇÃO GOOGLE
// ==========================================

test('POST /auth/google sem token retorna erro 400', async () => {
  const res = await request(app)
    .post('/auth/google')
    .send({});

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /token/i);
});

test('POST /client/auth/google sem token retorna erro 400', async () => {
  const res = await request(app)
    .post('/client/auth/google')
    .send({});

  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.success, false);
  assert.match(res.body.error, /token/i);
});

// ==========================================
// TESTES DE PROTEÇÃO DE ROTAS (SEM SESSÃO)
// ==========================================

test('GET /dashboard sem sessao redireciona para /login', async () => {
  const res = await request(app).get('/dashboard');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});

test('POST /appointments sem sessao redireciona para login', async () => {
  const res = await request(app)
    .post('/appointments')
    .type('form')
    .send({ customer_name: 'X' });

  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
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

// ==========================================
// TESTES DE BOOKING PÚBLICO
// ==========================================

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

// ==========================================
// TESTES DE ROTA 404
// ==========================================

test('Pagina inexistente retorna 404', async () => {
  const res = await request(app).get('/pagina-que-nao-existe');
  assert.strictEqual(res.status, 404);
});

test('GET /logout redireciona para /login', async () => {
  const res = await request(app).get('/logout');
  assert.strictEqual(res.status, 302);
  assert.strictEqual(res.headers.location, '/login');
});
