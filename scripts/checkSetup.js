/**
 * Script para verificar la configuración del proyecto
 *
 * Uso: node scripts/checkSetup.js
 */

require('dotenv').config();
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');

console.log('\n===========================================');
console.log('VERIFICACIÓN DE CONFIGURACIÓN');
console.log('===========================================\n');

const checks = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function logSuccess(message) {
  console.log(`✅ ${message}`);
  checks.passed++;
}

function logError(message) {
  console.log(`❌ ${message}`);
  checks.failed++;
}

function logWarning(message) {
  console.log(`⚠️  ${message}`);
  checks.warnings++;
}

async function checkEnvironmentVariables() {
  console.log('\n1. Variables de entorno\n');

  const required = [
    'WHATSAPP_PHONE_NUMBER_ID',
    'WHATSAPP_ACCESS_TOKEN',
    'GEMINI_API_KEY',
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REFRESH_TOKEN',
  ];

  const optional = [
    'PORT',
    'NODE_ENV',
    'BUSINESS_NAME',
    'TIMEZONE',
  ];

  required.forEach(varName => {
    if (process.env[varName]) {
      logSuccess(`${varName} configurado`);
    } else {
      logError(`${varName} no configurado`);
    }
  });

  optional.forEach(varName => {
    if (process.env[varName]) {
      logSuccess(`${varName} configurado (opcional)`);
    } else {
      logWarning(`${varName} no configurado (usando valor por defecto)`);
    }
  });
}

async function checkWhatsAppAPI() {
  console.log('\n2. WhatsApp Cloud API\n');

  try {
    const url = `https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      },
    });

    logSuccess('WhatsApp API - Conexión exitosa');
    console.log(`   Número verificado: ${response.data.verified_name || 'N/A'}`);
    console.log(`   Display name: ${response.data.display_phone_number || 'N/A'}`);
  } catch (error) {
    logError('WhatsApp API - Error de conexión');
    console.log(`   ${error.response?.data?.error?.message || error.message}`);
  }
}

async function checkGeminiAPI() {
  console.log('\n3. Gemini AI API\n');

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    const result = await model.generateContent('Responde solo: OK');
    const response = result.response.text();

    if (response) {
      logSuccess('Gemini API - Conexión exitosa');
      console.log(`   Respuesta de prueba: ${response.substring(0, 50)}...`);
    }
  } catch (error) {
    logError('Gemini API - Error de conexión');
    console.log(`   ${error.message}`);
  }
}

async function checkGoogleCalendarAPI() {
  console.log('\n4. Google Calendar API\n');

  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    oauth2Client.setCredentials({
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const response = await calendar.calendarList.list();

    logSuccess('Google Calendar API - Conexión exitosa');
    console.log(`   Calendarios disponibles: ${response.data.items.length}`);

    const primaryCalendar = response.data.items.find(cal => cal.id === 'primary');
    if (primaryCalendar) {
      console.log(`   Calendario principal: ${primaryCalendar.summary}`);
    }
  } catch (error) {
    logError('Google Calendar API - Error de conexión');
    console.log(`   ${error.message}`);
    if (error.message.includes('invalid_grant')) {
      console.log('   Tip: El refresh_token puede estar expirado. Ejecuta scripts/getRefreshToken.js');
    }
  }
}

async function checkDirectories() {
  console.log('\n5. Estructura de directorios\n');

  const fs = require('fs');
  const requiredDirs = [
    'src/config',
    'src/controllers',
    'src/services',
    'src/routes',
    'src/utils',
    'src/middleware',
    'logs',
  ];

  requiredDirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      logSuccess(`Directorio ${dir} existe`);
    } else {
      logError(`Directorio ${dir} no existe`);
    }
  });
}

async function main() {
  try {
    await checkEnvironmentVariables();
    await checkWhatsAppAPI();
    await checkGeminiAPI();
    await checkGoogleCalendarAPI();
    await checkDirectories();

    console.log('\n===========================================');
    console.log('RESUMEN');
    console.log('===========================================\n');
    console.log(`✅ Pruebas exitosas: ${checks.passed}`);
    console.log(`❌ Pruebas fallidas: ${checks.failed}`);
    console.log(`⚠️  Advertencias: ${checks.warnings}`);

    if (checks.failed === 0) {
      console.log('\n🎉 ¡Configuración completa! Tu proyecto está listo para funcionar.\n');
    } else {
      console.log('\n⚠️  Hay problemas en la configuración. Revisa los errores arriba.\n');
    }
  } catch (error) {
    console.error('\n❌ Error ejecutando verificación:', error.message);
  }
}

main();
