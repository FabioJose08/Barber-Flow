/**
 * Firebase Admin — Inicialização do Firestore.
 *
 * Duas formas de uso:
 *
 * 1) MODO PRODUÇÃO (Firebase real):
 *    Configure no .env:
 *      FIREBASE_PROJECT_ID=...
 *      FIREBASE_CLIENT_EMAIL=...
 *      FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
 *    (opcional: FIREBASE_DATABASE_URL)
 *
 * 2) MODO DESENVOLVIMENTO (placeholders / sem credenciais):
 *    Sem as variáveis acima, o app usa um Firestore em memória
 *    (memory-store.js) para que o projeto rode e possa ser testado.
 */

const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { createMemoryFirestore, FieldValue: MemoryFieldValue } = require('./memory-store');

const hasCredentials =
  process.env.FIREBASE_PROJECT_ID &&
  process.env.FIREBASE_CLIENT_EMAIL &&
  process.env.FIREBASE_PRIVATE_KEY;

let db;
let FieldValue;
let firebaseAdmin = null;

if (hasCredentials) {
  try {
    const admin = require('firebase-admin');
    const { getFirestore, FieldValue: FirestoreFieldValue } = require('firebase-admin/firestore');

    if (!admin.getApps().length) {
      admin.initializeApp({
        credential: admin.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        ...(process.env.FIREBASE_DATABASE_URL
          ? { databaseURL: process.env.FIREBASE_DATABASE_URL }
          : {})
      });
    }

    db = getFirestore();
    FieldValue = FirestoreFieldValue;
    firebaseAdmin = admin;
    console.log('Firebase Firestore conectado com sucesso!');
  } catch (err) {
    console.error('Falha ao inicializar Firebase Admin:', err.message);
    console.error('  Usando Firestore em memória (modo desenvolvimento).');
    db = createMemoryFirestore();
    FieldValue = MemoryFieldValue;
  }
} else {
  console.warn('Credenciais Firebase nao configuradas no .env.');
  console.warn('  Usando Firestore em memoria (modo desenvolvimento).');
  console.warn('  Para producao, configure FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL e FIREBASE_PRIVATE_KEY.');
  db = createMemoryFirestore();
  FieldValue = MemoryFieldValue;
}

module.exports = { db, FieldValue, admin: firebaseAdmin };
