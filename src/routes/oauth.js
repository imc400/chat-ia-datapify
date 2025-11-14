const express = require('express');
const router = express.Router();
const { google } = require('googleapis');
const config = require('../config');
const logger = require('../utils/logger');

// Configurar OAuth2
const oauth2Client = new google.auth.OAuth2(
  config.googleCalendar.clientId,
  config.googleCalendar.clientSecret,
  config.googleCalendar.redirectUri
);

const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events',
];

// Ruta para iniciar el flujo OAuth
router.get('/google', (req, res) => {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
  });

  logger.info('Redirigiendo a Google OAuth', { authUrl });
  res.redirect(authUrl);
});

// Ruta de callback después de la autorización
router.get('/callback', async (req, res) => {
  const code = req.query.code;

  if (!code) {
    logger.error('No se recibió código de autorización');
    return res.status(400).send(`
      <html>
        <head>
          <title>Error - Datapify Calendar</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 50px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #d32f2f; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Error</h1>
            <p>No se recibió el código de autorización.</p>
            <p>Por favor, vuelve a intentarlo visitando: <code>http://localhost:3000/auth/google</code></p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    // Intercambiar código por tokens
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    logger.info('✅ Tokens obtenidos exitosamente');

    // Mostrar página de éxito con el refresh token
    res.send(`
      <html>
        <head>
          <title>Autorización Exitosa - Datapify Calendar</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            }
            .container {
              max-width: 700px;
              margin: 0 auto;
              background: white;
              padding: 40px;
              border-radius: 15px;
              box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            }
            h1 { color: #4caf50; margin-bottom: 10px; }
            h2 { color: #333; font-size: 18px; margin-top: 30px; }
            .token-box {
              background: #f5f5f5;
              padding: 20px;
              border-radius: 8px;
              border-left: 4px solid #4caf50;
              margin: 20px 0;
              word-break: break-all;
              font-family: 'Courier New', monospace;
              font-size: 14px;
            }
            .warning {
              background: #fff3cd;
              border-left: 4px solid #ffc107;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .instructions {
              background: #e3f2fd;
              border-left: 4px solid #2196f3;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .instructions ol { margin: 10px 0; padding-left: 20px; }
            .instructions li { margin: 8px 0; }
            code {
              background: #f5f5f5;
              padding: 2px 8px;
              border-radius: 4px;
              font-family: 'Courier New', monospace;
              color: #d32f2f;
            }
            button {
              background: #4caf50;
              color: white;
              border: none;
              padding: 10px 20px;
              border-radius: 5px;
              cursor: pointer;
              font-size: 16px;
              margin-top: 10px;
            }
            button:hover { background: #45a049; }
          </style>
          <script>
            function copyToken() {
              const token = document.getElementById('refresh-token').textContent;
              navigator.clipboard.writeText(token).then(() => {
                const btn = document.getElementById('copy-btn');
                btn.textContent = '✅ Copiado!';
                setTimeout(() => { btn.textContent = '📋 Copiar Token'; }, 2000);
              });
            }
          </script>
        </head>
        <body>
          <div class="container">
            <h1>✅ Autorización Exitosa!</h1>
            <p>Google Calendar ha sido conectado correctamente con Datapify.</p>

            ${tokens.refresh_token ? `
              <h2>📝 Refresh Token obtenido:</h2>
              <div class="token-box" id="refresh-token">${tokens.refresh_token}</div>
              <button id="copy-btn" onclick="copyToken()">📋 Copiar Token</button>

              <div class="warning">
                <strong>⚠️ IMPORTANTE:</strong><br>
                El refresh_token solo se muestra UNA VEZ. Guárdalo en un lugar seguro.
              </div>

              <div class="instructions">
                <strong>📋 Próximos pasos:</strong>
                <ol>
                  <li>Copia el token de arriba (haz clic en el botón "Copiar Token")</li>
                  <li>Abre tu archivo <code>.env</code></li>
                  <li>Busca la línea: <code>GOOGLE_REFRESH_TOKEN=pendiente</code></li>
                  <li>Reemplázala con: <code>GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}</code></li>
                  <li>Guarda el archivo</li>
                  <li>Reinicia el servidor: <code>Ctrl+C</code> y luego <code>npm start</code></li>
                </ol>
              </div>
            ` : `
              <div class="warning">
                <strong>⚠️ No se obtuvo refresh_token</strong><br>
                Esto puede pasar si ya autorizaste esta aplicación antes.<br><br>
                <strong>Solución:</strong>
                <ol>
                  <li>Ve a: <a href="https://myaccount.google.com/permissions" target="_blank">https://myaccount.google.com/permissions</a></li>
                  <li>Revoca el acceso de "Datapify Calendar Bot"</li>
                  <li>Vuelve a visitar: <code>http://localhost:3000/auth/google</code></li>
                </ol>
              </div>
            `}

            <h2>🔧 Información adicional:</h2>
            <p><strong>Access Token:</strong> ${tokens.access_token?.substring(0, 50)}...</p>
            <p><strong>Expira:</strong> ${new Date(tokens.expiry_date).toLocaleString()}</p>

            <p style="margin-top: 40px; color: #666; font-size: 14px;">
              Puedes cerrar esta ventana y volver a tu terminal.
            </p>
          </div>
        </body>
      </html>
    `);

  } catch (error) {
    logger.error('Error obteniendo tokens:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Error - Datapify Calendar</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 50px; background: #f5f5f5; }
            .container { max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            h1 { color: #d32f2f; }
            .error-box { background: #ffebee; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #d32f2f; }
            code { background: #f5f5f5; padding: 2px 6px; border-radius: 3px; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Error al obtener tokens</h1>
            <div class="error-box">
              <strong>Error:</strong> ${error.message}
            </div>
            <p><strong>Verifica que:</strong></p>
            <ol>
              <li>El código no haya expirado (intenta de nuevo)</li>
              <li>El <code>CLIENT_ID</code> y <code>CLIENT_SECRET</code> sean correctos en el <code>.env</code></li>
              <li>La URL de redirección en Google Cloud Console sea: <code>http://localhost:3000/oauth/callback</code></li>
            </ol>
            <p>Vuelve a intentar visitando: <code>http://localhost:3000/auth/google</code></p>
          </div>
        </body>
      </html>
    `);
  }
});

module.exports = router;
