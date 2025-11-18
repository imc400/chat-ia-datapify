const express = require('express');
const router = express.Router();
const config = require('../config');
const logger = require('../utils/logger');
const messageController = require('../controllers/messageController');

// Control de concurrencia: evita procesar múltiples mensajes del mismo usuario simultáneamente
const processingLocks = new Map(); // phone -> Promise

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
              const phone = message.from;

              logger.info('📩 Mensaje recibido', {
                from: phone,
                type: message.type,
                messageId: message.id,
              });

              // Control de concurrencia: esperar si hay otro mensaje del mismo usuario procesándose
              const processMessageSequentially = async () => {
                // Si hay un lock activo para este teléfono, esperar a que termine
                if (processingLocks.has(phone)) {
                  logger.info('⏳ Esperando a que termine procesamiento previo', { phone });
                  try {
                    await processingLocks.get(phone);
                  } catch (err) {
                    // Ignorar errores del procesamiento anterior
                  }
                }

                // Crear un nuevo lock para este teléfono
                const processingPromise = messageController.processMessage(message, value.metadata)
                  .catch(err => {
                    logger.error('Error procesando mensaje:', err);
                  })
                  .finally(() => {
                    // Limpiar el lock cuando termine
                    if (processingLocks.get(phone) === processingPromise) {
                      processingLocks.delete(phone);
                    }
                  });

                processingLocks.set(phone, processingPromise);
                return processingPromise;
              };

              // Ejecutar de forma asíncrona pero controlada
              processMessageSequentially().catch(err => {
                logger.error('Error en procesamiento secuencial:', err);
              });
            }
          }

          // Procesar estados de mensajes (entregados, leídos, etc.)
          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              logger.info('📊 Estado de mensaje actualizado', {
                messageId: status.id,
                status: status.status,
                recipient: status.recipient_id,
              });

              // Procesar el status update de forma asíncrona
              const processStatusUpdate = async () => {
                try {
                  const prisma = require('../db/prisma');

                  // Buscar el recipient por messageId
                  const recipient = await prisma.campaignRecipient.findFirst({
                    where: { messageId: status.id },
                    include: { campaign: true },
                  });

                  if (!recipient) {
                    logger.debug('No se encontró CampaignRecipient para este messageId', { messageId: status.id });
                    return;
                  }

                  // Actualizar según el status
                  const updateData = {};

                  if (status.status === 'delivered') {
                    updateData.status = 'delivered';
                    updateData.deliveredAt = new Date(status.timestamp * 1000);

                    // Incrementar deliveredCount en la campaña
                    await prisma.campaign.update({
                      where: { id: recipient.campaignId },
                      data: { deliveredCount: { increment: 1 } },
                    });

                    logger.info('✅ Mensaje marcado como entregado', {
                      phone: recipient.phone,
                      campaignId: recipient.campaignId,
                      campaignName: recipient.campaign.name,
                    });
                  }
                  else if (status.status === 'read') {
                    updateData.status = 'read';
                    updateData.readAt = new Date(status.timestamp * 1000);

                    // Incrementar readCount en la campaña (solo si no estaba ya como read)
                    if (recipient.status !== 'read') {
                      await prisma.campaign.update({
                        where: { id: recipient.campaignId },
                        data: { readCount: { increment: 1 } },
                      });
                    }

                    logger.info('👁️ Mensaje marcado como leído', {
                      phone: recipient.phone,
                      campaignId: recipient.campaignId,
                      campaignName: recipient.campaign.name,
                    });
                  }

                  // Actualizar el recipient
                  if (Object.keys(updateData).length > 0) {
                    await prisma.campaignRecipient.update({
                      where: { id: recipient.id },
                      data: updateData,
                    });
                  }
                } catch (err) {
                  logger.error('Error procesando status update:', err);
                }
              };

              // Ejecutar de forma asíncrona
              processStatusUpdate().catch(err => {
                logger.error('Error en processStatusUpdate:', err);
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
