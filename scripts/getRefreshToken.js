/**
 * Script para obtener el Refresh Token de Google Calendar
 *
 * Uso:
 * 1. Configura CLIENT_ID y CLIENT_SECRET abajo
 * 2. Ejecuta: node scripts/getRefreshToken.js
 * 3. Sigue las instrucciones en consola
 * 4. Copia el refresh_token obtenido a tu .env
 */

require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

// Configuración OAuth2
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'TU_CLIENT_ID_AQUI';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'TU_CLIENT_SECRET_AQUI';
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

// Scopes necesarios para Google Calendar
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Generar URL de autorización
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Forzar pantalla de consentimiento para obtener refresh_token
});

console.log('\n===========================================');
console.log('SCRIPT PARA OBTENER REFRESH TOKEN DE GOOGLE');
console.log('===========================================\n');

console.log('Paso 1: Autoriza esta aplicación visitando la siguiente URL:\n');
console.log(authUrl);
console.log('\n');

// Crear interfaz para leer el código de autorización
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Paso 2: Ingresa el código de autorización que aparece en la URL de redirección: ', async (code) => {
  try {
    // Intercambiar código por tokens
    const { tokens } = await oauth2Client.getToken(code);

    console.log('\n✅ Tokens obtenidos exitosamente!\n');
    console.log('===========================================');
    console.log('COPIA ESTOS VALORES A TU ARCHIVO .env:');
    console.log('===========================================\n');

    if (tokens.refresh_token) {
      console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
      console.log('\n⚠️  IMPORTANTE: El refresh_token solo se muestra la primera vez.');
      console.log('   Guárdalo en un lugar seguro.\n');
    } else {
      console.log('⚠️  No se obtuvo refresh_token.');
      console.log('   Esto puede pasar si ya autorizaste antes.');
      console.log('   Revoca el acceso en https://myaccount.google.com/permissions');
      console.log('   y vuelve a ejecutar este script.\n');
    }

    console.log('También puedes necesitar estos valores:');
    console.log(`Access Token: ${tokens.access_token}`);
    console.log(`Expira en: ${tokens.expiry_date}`);

    console.log('\n===========================================\n');

  } catch (error) {
    console.error('\n❌ Error obteniendo tokens:', error.message);
    console.log('\nVerifica que:');
    console.log('1. El código sea correcto y no haya expirado');
    console.log('2. CLIENT_ID y CLIENT_SECRET sean correctos');
    console.log('3. La URL de redirección coincida con la configurada en Google Cloud Console\n');
  } finally {
    rl.close();
  }
});
