/**
 * MemoryStore — Implementação em memória da API do Firestore Admin SDK.
 *
 * Usada apenas em MODO DESENVOLVIMENTO quando as credenciais reais do
 * Firebase ainda não foram configuradas no .env. Permite que o projeto
 * rode e seja testado sem depender de um projeto Firebase ativo.
 *
 * Os dados são perdidos quando o processo termina.
 */

function generateId() {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let id = '';
  for (let i = 0; i < 20; i += 1) {
    id += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return id;
}

class FieldValue {
  constructor(type, value) {
    this._type = type;
    this._value = value;
  }

  static serverTimestamp() {
    return new FieldValue('serverTimestamp');
  }

  static increment(n) {
    return new FieldValue('increment', n);
  }
}

function resolveFieldValue(value, now) {
  if (value instanceof FieldValue) {
    if (value._type === 'serverTimestamp') return now;
    if (value._type === 'increment') return value._value;
  }
  return value;
}

class DocumentSnapshot {
  constructor(store, id, exists, ref = null) {
    this._store = store;
    this._id = id;
    this._exists = exists;
    this._ref = ref;
  }

  get id() {
    return this._id;
  }

  get exists() {
    return this._exists;
  }

  get ref() {
    if (!this._ref) {
      this._ref = new DocRef(this._store, this._id);
    }
    return this._ref;
  }

  data() {
    if (!this._exists) return undefined;
    return { ...this._store.get(this._id) };
  }

  get(field) {
    const data = this.data();
    return data ? data[field] : undefined;
  }
}

class QuerySnapshot {
  constructor(docs) {
    this._docs = docs;
  }

  get docs() {
    return this._docs;
  }

  get empty() {
    return this._docs.length === 0;
  }

  get size() {
    return this._docs.length;
  }

  forEach(callback) {
    this._docs.forEach(callback);
  }
}

class QueryRef {
  constructor(store) {
    this._store = store;
    this._wheres = [];
    this._orderBys = [];
    this._limit = null;
  }

  where(field, op, value) {
    this._wheres.push({ field, op, value });
    return this;
  }

  orderBy(field, direction = 'asc') {
    this._orderBys.push({ field, direction });
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  get() {
    let docs = [];

    this._store.forEach((data, id) => {
      for (const where of this._wheres) {
        const actual = data[where.field];
        const expected = where.value;
        let matches = false;

        switch (where.op) {
          case '==':
            matches = actual === expected || (actual == null && expected == null);
            break;
          case '!=':
            matches = actual !== expected;
            break;
          case '>':
            matches = actual > expected;
            break;
          case '>=':
            matches = actual >= expected;
            break;
          case '<':
            matches = actual < expected;
            break;
          case '<=':
            matches = actual <= expected;
            break;
          case 'in':
            matches = Array.isArray(expected) && expected.includes(actual);
            break;
          case 'array-contains':
            matches = Array.isArray(actual) && actual.includes(expected);
            break;
          default:
            matches = false;
        }

        if (!matches) return;
      }

      docs.push(new DocumentSnapshot(this._store, id, true, new DocRef(this._store, id)));
    });

    for (const order of this._orderBys) {
      docs.sort((a, b) => {
        const av = a.data()[order.field];
        const bv = b.data()[order.field];
        if (av < bv) return order.direction === 'asc' ? -1 : 1;
        if (av > bv) return order.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    if (this._limit !== null) {
      docs = docs.slice(0, this._limit);
    }

    return Promise.resolve(new QuerySnapshot(docs));
  }
}

class DocRef {
  constructor(store, id) {
    this._store = store;
    this._id = id || generateId();
  }

  get id() {
    return this._id;
  }

  get() {
    const doc = this._store.get(this._id);
    if (doc === undefined) {
      return Promise.resolve(new DocumentSnapshot(this._store, this._id, false, this));
    }
    return Promise.resolve(new DocumentSnapshot(this._store, this._id, true, this));
  }

  set(data, options = {}) {
    const now = new Date().toISOString();
    const resolved = {};
    Object.entries(data).forEach(([key, val]) => {
      resolved[key] = resolveFieldValue(val, now);
    });

    if (options.merge) {
      const existing = this._store.get(this._id) || {};
      this._store.set(this._id, { ...existing, ...resolved });
    } else {
      this._store.set(this._id, resolved);
    }
    return Promise.resolve();
  }

  update(data) {
    const now = new Date().toISOString();
    const existing = this._store.get(this._id);
    if (existing === undefined) {
      return Promise.reject(new Error(`Document ${this._id} does not exist`));
    }
    const resolved = {};
    Object.entries(data).forEach(([key, val]) => {
      resolved[key] = resolveFieldValue(val, now);
    });
    this._store.set(this._id, { ...existing, ...resolved });
    return Promise.resolve();
  }

  delete() {
    this._store.delete(this._id);
    return Promise.resolve();
  }
}

class CollectionRef {
  constructor(store) {
    this._store = store;
  }

  doc(id) {
    return new DocRef(this._store, id);
  }

  add(data) {
    const ref = this.doc(generateId());
    return ref.set(data).then(() => ref);
  }

  where(field, op, value) {
    const query = new QueryRef(this._store);
    return query.where(field, op, value);
  }

  orderBy(field, direction) {
    const query = new QueryRef(this._store);
    return query.orderBy(field, direction);
  }

  limit(n) {
    const query = new QueryRef(this._store);
    return query.limit(n);
  }

  get() {
    const query = new QueryRef(this._store);
    return query.get();
  }
}

class MemoryFirestore {
  constructor() {
    this._collections = new Map();
  }

  _getStore(name) {
    if (!this._collections.has(name)) {
      this._collections.set(name, new Map());
    }
    return this._collections.get(name);
  }

  collection(name) {
    return new CollectionRef(this._getStore(name));
  }

  _reset() {
    this._collections.clear();
  }
}

/**
 * Cria uma instância do Firestore em memória.
 * @returns {MemoryFirestore}
 */
function createMemoryFirestore() {
  return new MemoryFirestore();
}

module.exports = {
  createMemoryFirestore,
  FieldValue
};
