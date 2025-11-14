const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');
const messageController = require('../controllers/messageController');

// Verificación del webhook (GET request de Meta)
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Verificación de webhook recibida', { mode, token });

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    logger.info('✅ Webhook verificado correctamente');
    res.status(200).send(challenge);
  } else {
    logger.warn('❌ Verificación de webhook fallida');
    res.status(403).json({ error: 'Token de verificación inválido' });
  }
});

// Recepción de mensajes (POST request de Meta)
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    // Respuesta inmediata a WhatsApp (requisito de la API)
    res.status(200).send('EVENT_RECEIVED');

    // Validar estructura del webhook
    if (!body.object || body.object !== 'whatsapp_business_account') {
      logger.warn('Webhook recibido pero no es de WhatsApp Business', { body });
      return;
    }

    // Procesar cada entrada
    if (body.entry && body.entry.length > 0) {
      for (const entry of body.entry) {
        if (!entry.changes || entry.changes.length === 0) continue;

        for (const change of entry.changes) {
          if (change.field !== 'messages') continue;

          const value = change.value;

          // Procesar mensajes entrantes
          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              logger.info('📩 Mensaje recibido', {
                from: message.from,
                type: message.type,
                messageId: message.id,
              });

              // Procesar el mensaje de forma asíncrona
              messageController.processMessage(message, value.metadata)
                .catch(err => {
                  logger.error('Error procesando mensaje:', err);
                });
            }
          }

          // Procesar estados de mensajes (entregados, leídos, etc.)
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              logger.info('📊 Estado de mensaje actualizado', {
                messageId: status.id,
                status: status.status,
              });
            }
          }
        }
      }
    }
  } catch (error) {
    logger.error('Error en webhook POST:', error);
    // No enviamos error al cliente porque ya respondimos 200
  }
});

module.exports = router;
