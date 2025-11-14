require('dotenv').config();

const config = {
  // Servidor
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',

  // WhatsApp Cloud API
  whatsapp: {
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN || 'datapify_verify_token_2025',
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v18.0',
    baseUrl: 'https://graph.facebook.com',
  },

  // Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-pro',
    temperature: parseFloat(process.env.GEMINI_TEMPERATURE) || 0.7,
    maxTokens: parseInt(process.env.GEMINI_MAX_TOKENS) || 1024,
  },

  // Google Calendar
  googleCalendar: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
    calendarId: process.env.GOOGLE_CALENDAR_ID || 'primary',
    bookingLink: process.env.GOOGLE_CALENDAR_BOOKING_LINK,
    timezone: process.env.TIMEZONE || 'America/Mexico_City',
  },

  // Configuración del bot
  bot: {
    businessName: process.env.BUSINESS_NAME || 'Datapify',
    defaultMeetingDuration: parseInt(process.env.DEFAULT_MEETING_DURATION) || 60, // minutos
    businessHoursStart: parseInt(process.env.BUSINESS_HOURS_START) || 9, // 9 AM
    businessHoursEnd: parseInt(process.env.BUSINESS_HOURS_END) || 18, // 6 PM
    workingDays: [1, 2, 3, 4, 5], // Lunes a Viernes
  },
};

// Validación básica
const requiredEnvVars = [
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_ACCESS_TOKEN',
  'GEMINI_API_KEY',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('❌ Variables de entorno faltantes:', missingVars.join(', '));
  console.error('Por favor, configura tu archivo .env');
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
}

// Advertencia si falta REFRESH_TOKEN pero no es crítico para iniciar
if (!process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_REFRESH_TOKEN === 'pendiente') {
  console.warn('⚠️  GOOGLE_REFRESH_TOKEN no configurado. Visita http://localhost:3000/oauth/google para obtenerlo');
}

module.exports = config;
