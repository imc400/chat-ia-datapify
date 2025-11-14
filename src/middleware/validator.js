const Joi = require('joi');
const logger = require('../utils/logger');

/**
 * Middleware para validar el payload del webhook de WhatsApp
 */
function validateWhatsAppWebhook(req, res, next) {
  const schema = Joi.object({
    object: Joi.string().valid('whatsapp_business_account').required(),
    entry: Joi.array().items(
      Joi.object({
        id: Joi.string().required(),
        changes: Joi.array().items(
          Joi.object({
            field: Joi.string().required(),
            value: Joi.object().required(),
          })
        ).required(),
      })
    ).required(),
  });

  const { error } = schema.validate(req.body);

  if (error) {
    logger.warn('Payload de webhook inválido', { error: error.details });
    return res.status(400).json({ error: 'Payload inválido' });
  }

  next();
}

/**
 * Middleware para validar parámetros de verificación del webhook
 */
function validateWebhookVerification(req, res, next) {
  const schema = Joi.object({
    'hub.mode': Joi.string().valid('subscribe').required(),
    'hub.verify_token': Joi.string().required(),
    'hub.challenge': Joi.string().required(),
  });

  const { error } = schema.validate(req.query);

  if (error) {
    logger.warn('Parámetros de verificación inválidos', { error: error.details });
    return res.status(400).json({ error: 'Parámetros inválidos' });
  }

  next();
}

/**
 * Middleware para validar datos de agendamiento
 */
function validateScheduleData(data) {
  const schema = Joi.object({
    name: Joi.string().min(2).max(100).required(),
    reason: Joi.string().min(5).max(500).required(),
    date: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).required(),
    time: Joi.string().pattern(/^\d{2}:\d{2}$/).required(),
    email: Joi.string().email().optional(),
    phone: Joi.string().optional(),
    duration: Joi.number().integer().min(15).max(480).optional(),
  });

  return schema.validate(data);
}

module.exports = {
  validateWhatsAppWebhook,
  validateWebhookVerification,
  validateScheduleData,
};
