const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

// Load env variables if not already loaded (useful for direct scripts)
if (fs.existsSync(path.join(__dirname, '../.env'))) {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
}

const dbPath = process.env.DB_PATH 
  ? path.resolve(process.env.DB_PATH) 
  : path.join(__dirname, 'database.db');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

console.log(`Connecting to database at: ${dbPath}`);
const db = new DatabaseSync(dbPath);

// Enable foreign keys support
db.exec('PRAGMA foreign_keys = ON;');

// Create Users Table
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Create Appointments Table (with 'Pendente' status for self-service bookings)
db.exec(`
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    service_type TEXT NOT NULL,
    price REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado')),
    appointment_date DATETIME NOT NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// If the current appointments table still has an older CHECK constraint, migrate it safely.
const existingAppointments = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'appointments'").get();
if (existingAppointments && typeof existingAppointments.sql === 'string' && existingAppointments.sql.includes("CHECK(status IN ('Agendado', 'Em Andamento', 'Finalizado', 'Cancelado'))")) {
  db.exec('BEGIN TRANSACTION;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS appointments_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      service_type TEXT NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pendente' CHECK(status IN ('Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado')),
      appointment_date DATETIME NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      client_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);
  db.exec(`
    INSERT INTO appointments_new (id, user_id, customer_name, customer_phone, service_type, price, status, appointment_date, notes, created_at, client_id)
    SELECT id, user_id, customer_name, customer_phone, service_type, price, status, appointment_date, notes, created_at, client_id
    FROM appointments;
  `);
  db.exec('DROP TABLE appointments;');
  db.exec('ALTER TABLE appointments_new RENAME TO appointments;');
  db.exec('COMMIT;');
  console.log("Tabela 'appointments' migrada para aceitar o status 'Pendente'.");
}

// Create Services Catalog Table
db.exec(`
  CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    price REAL NOT NULL,
    duration_min INTEGER NOT NULL DEFAULT 30,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Create Barber Config Table (one row per user/barber)
db.exec(`
  CREATE TABLE IF NOT EXISTS barber_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER UNIQUE NOT NULL,
    shop_name TEXT NOT NULL DEFAULT 'Minha Barbearia',
    open_time TEXT NOT NULL DEFAULT '09:00',
    close_time TEXT NOT NULL DEFAULT '19:00',
    slot_interval INTEGER NOT NULL DEFAULT 30,
    booking_token TEXT UNIQUE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Executa migrações para adicionar campos necessários para suporte a clientes
try {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'barbeiro';");
  console.log("Coluna 'role' adicionada com sucesso ou já existente na tabela 'users'.");
} catch (err) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE users ADD COLUMN phone TEXT;");
  console.log("Coluna 'phone' adicionada com sucesso ou já existente na tabela 'users'.");
} catch (err) {
  // Ignora se a coluna já existir
}

try {
  db.exec("ALTER TABLE appointments ADD COLUMN client_id INTEGER REFERENCES users(id) ON DELETE SET NULL;");
  console.log("Coluna 'client_id' adicionada com sucesso ou já existente na tabela 'appointments'.");
} catch (err) {
  // Ignora se a coluna já existir
}

module.exports = db;
