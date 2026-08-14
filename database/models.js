const mongoose = require('mongoose');

// User Schema (Barbers & Clients)
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    enum: ['barbeiro', 'cliente'],
    default: 'cliente'
  },
  phone: {
    type: String,
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Appointment Schema
const appointmentSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  customer_name: {
    type: String,
    required: true
  },
  customer_phone: {
    type: String,
    required: true
  },
  customer_email: {
    type: String,
    default: null
  },
  service_type: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['Pendente', 'Agendado', 'Em Andamento', 'Finalizado', 'Cancelado'],
    default: 'Pendente'
  },
  appointment_date: {
    type: Date,
    required: true
  },
  notes: {
    type: String,
    default: null
  },
  client_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Service Schema
const serviceSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true
  },
  duration_min: {
    type: Number,
    default: 30
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Chatbot Message Schema
const chatbotMessageSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null
  },
  session_id: {
    type: String,
    default: null
  },
  role: {
    type: String,
    enum: ['user', 'assistant'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

// Barber Config Schema
const barberConfigSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  shop_name: {
    type: String,
    default: 'SAS Barber'
  },
  open_time: {
    type: String,
    default: '09:00'
  },
  close_time: {
    type: String,
    default: '20:00'
  },
  slot_interval: {
    type: Number,
    default: 30
  },
  booking_token: {
    type: String,
    required: true,
    unique: true
  },
  created_at: {
    type: Date,
    default: Date.now
  }
});

module.exports = {
  User: mongoose.model('User', userSchema),
  Appointment: mongoose.model('Appointment', appointmentSchema),
  Service: mongoose.model('Service', serviceSchema),
  ChatbotMessage: mongoose.model('ChatbotMessage', chatbotMessageSchema),
  BarberConfig: mongoose.model('BarberConfig', barberConfigSchema)
};
