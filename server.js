require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const logger = require('./src/utils/logger');
const webhookRoutes = require('./src/routes/webhook');
const oauthRoutes = require('./src/routes/oauth');
const analyticsRoutes = require('./src/routes/analytics');
const dashboardRoutes = require('./src/routes/dashboard');
const testCalendarRoutes = require('./src/routes/test-calendar');

const app = express();
const PORT = process.env.PORT || 3000;

// Confiar en proxies (necesario para Railway, Heroku, etc.)
app.set('trust proxy', 1);

// Middleware de seguridad
app.use(helmet());

// Rate limiting para proteger el webhook
// Configuración escalable para Meta Ads
const webhookLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60, // 60 requests/min = 1 por segundo sostenido
  message: 'Demasiadas solicitudes desde esta IP, intenta más tarde',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Rate limit más permisivo para el dashboard
const dashboardLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 120, // Dashboard puede hacer más requests
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/webhook', webhookLimiter);
app.use('/api/dashboard', dashboardLimiter);

// Parseo de JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos (dashboard frontend)
app.use('/dashboard', express.static('public/dashboard'));

// Rutas
app.use('/webhook', webhookRoutes);
app.use('/oauth', oauthRoutes);
app.use('/api/analytics', analyticsRoutes); // NUEVO: Dashboard de aprendizaje
app.use('/api/dashboard', dashboardRoutes); // NUEVO: Dashboard API
app.use('/test-calendar', testCalendarRoutes); // TEST: Ver eventos de calendario

// Ruta de salud
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'WhatsApp AI Calendar Bot'
  });
});

// Manejo de errores global
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({
    error: 'Error interno del servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Manejo de rutas no encontradas
app.use((req, res) => {
  res.status(404).json({ error: 'Ruta no encontrada' });
});

// Iniciar servidor
app.listen(PORT, () => {
  logger.info(`🚀 Servidor iniciado en puerto ${PORT}`);
  logger.info(`📱 Webhook disponible en: http://localhost:${PORT}/webhook`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/health`);
});

// Manejo de errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Promesa no manejada en:', promise, 'razón:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Excepción no capturada:', error);
  process.exit(1);
});

module.exports = app;
