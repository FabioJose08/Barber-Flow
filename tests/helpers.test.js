const { test } = require('node:test');
const assert = require('node:assert');

const {
  serializeDoc,
  docToApp,
  docsToApp,
  parseDateTimeLocal
} = require('../database/helpers');

test('serializeDoc adiciona o campo id e preserva campos simples', () => {
  const result = serializeDoc({ name: 'João', price: 40 }, 'abc123');

  assert.strictEqual(result.id, 'abc123');
  assert.strictEqual(result.name, 'João');
  assert.strictEqual(result.price, 40);
});

test('serializeDoc converte Date para string ISO', () => {
  const date = new Date('2025-01-15T10:30:00.000Z');
  const result = serializeDoc({ appointment_date: date }, 'xyz');

  assert.strictEqual(result.appointment_date, '2025-01-15T10:30:00.000Z');
});

test('serializeDoc converte objeto com toDate() (Firebase Timestamp) para ISO', () => {
  const fakeTimestamp = {
    toDate: () => new Date('2025-02-01T12:00:00.000Z')
  };
  const result = serializeDoc({ created_at: fakeTimestamp }, 't1');

  assert.strictEqual(result.created_at, '2025-02-01T12:00:00.000Z');
});

test('serializeDoc converte timestamp bruto (_seconds/_nanoseconds)', () => {
  const raw = { _seconds: 1738422000, _nanoseconds: 0 }; // 2025-02-01T12:00:00Z
  const result = serializeDoc({ created_at: raw }, 't2');

  const expected = new Date(1738422000 * 1000).toISOString();
  assert.strictEqual(result.created_at, expected);
});

test('serializeDoc lida com objeto vazio e id vazio', () => {
  const result = serializeDoc({}, '');
  assert.deepStrictEqual(result, { id: '' });
});

test('docToApp converte um snapshot fake em objeto do app', () => {
  const fakeDoc = {
    id: 'doc1',
    data: () => ({ name: 'Cliente Teste', price: 30 })
  };

  const result = docToApp(fakeDoc);
  assert.strictEqual(result.id, 'doc1');
  assert.strictEqual(result.name, 'Cliente Teste');
  assert.strictEqual(result.price, 30);
});

test('docToApp retorna objeto com id mesmo quando data() é undefined', () => {
  const fakeDoc = {
    id: 'doc2',
    data: () => undefined
  };

  const result = docToApp(fakeDoc);
  assert.strictEqual(result.id, 'doc2');
});

test('docsToApp mapeia uma lista de snapshots', () => {
  const fakeDocs = [
    { id: 'a', data: () => ({ name: 'A' }) },
    { id: 'b', data: () => ({ name: 'B' }) }
  ];

  const result = docsToApp(fakeDocs);
  assert.strictEqual(result.length, 2);
  assert.strictEqual(result[0].id, 'a');
  assert.strictEqual(result[1].name, 'B');
});

test('parseDateTimeLocal converte string ISO local em Date', () => {
  const result = parseDateTimeLocal('2025-03-10T14:30');
  assert.ok(result instanceof Date);
  assert.strictEqual(result.getFullYear(), 2025);
  assert.strictEqual(result.getMonth(), 2); // 0-indexed: Março
  assert.strictEqual(result.getDate(), 10);
  assert.strictEqual(result.getHours(), 14);
  assert.strictEqual(result.getMinutes(), 30);
});

test('parseDateTimeLocal retorna null para entrada vazia', () => {
  assert.strictEqual(parseDateTimeLocal(''), null);
  assert.strictEqual(parseDateTimeLocal(null), null);
  assert.strictEqual(parseDateTimeLocal(undefined), null);
});
