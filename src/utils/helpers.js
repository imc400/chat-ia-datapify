const moment = require('moment-timezone');
const config = require('../config');

/**
 * Valida formato de teléfono de WhatsApp
 */
function isValidWhatsAppNumber(phone) {
  // Formato: código de país + número (sin +, sin espacios)
  const regex = /^\d{10,15}$/;
  return regex.test(phone);
}

/**
 * Formatea un número de teléfono para WhatsApp
 */
function formatWhatsAppNumber(phone) {
  // Eliminar todos los caracteres no numéricos
  const cleaned = phone.replace(/\D/g, '');

  // Validar longitud
  if (cleaned.length < 10 || cleaned.length > 15) {
    throw new Error('Número de teléfono inválido');
  }

  return cleaned;
}

/**
 * Valida formato de fecha YYYY-MM-DD
 */
function isValidDate(dateString) {
  const date = moment(dateString, 'YYYY-MM-DD', true);
  return date.isValid();
}

/**
 * Valida formato de hora HH:mm
 */
function isValidTime(timeString) {
  const time = moment(timeString, 'HH:mm', true);
  return time.isValid();
}

/**
 * Convierte fecha y hora a formato legible
 */
function formatDateTime(date, time) {
  const dateTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', config.googleCalendar.timezone);
  return dateTime.format('dddd, DD [de] MMMM [de] YYYY [a las] HH:mm');
}

/**
 * Extrae fecha del texto del usuario (formato flexible)
 */
function extractDateFromText(text) {
  // Patrones comunes
  const patterns = [
    // YYYY-MM-DD
    /(\d{4})-(\d{2})-(\d{2})/,
    // DD/MM/YYYY
    /(\d{2})\/(\d{2})\/(\d{4})/,
    // Mañana, pasado mañana
    /(mañana|ma[ñn]ana)/i,
    /(pasado mañana|pasado ma[ñn]ana)/i,
  ];

  const now = moment.tz(config.googleCalendar.timezone);

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[0].match(/mañana/i) && !match[0].match(/pasado/i)) {
        return now.add(1, 'day').format('YYYY-MM-DD');
      } else if (match[0].match(/pasado mañana/i)) {
        return now.add(2, 'days').format('YYYY-MM-DD');
      } else if (match[1] && match[2] && match[3]) {
        // Formato de fecha encontrado
        if (match[0].includes('-')) {
          return match[0];
        } else {
          // DD/MM/YYYY a YYYY-MM-DD
          return `${match[3]}-${match[2]}-${match[1]}`;
        }
      }
    }
  }

  return null;
}

/**
 * Extrae hora del texto del usuario
 */
function extractTimeFromText(text) {
  // Patrones de hora
  const patterns = [
    // HH:mm
    /(\d{1,2}):(\d{2})/,
    // HH am/pm
    /(\d{1,2})\s*(am|pm|a\.m\.|p\.m\.)/i,
    // Número solo (asume hora en punto)
    /\b(\d{1,2})\b/,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      let hour = parseInt(match[1]);
      const minute = match[2] ? match[2] : '00';

      // Convertir PM a formato 24h
      if (match[2] && match[2].toLowerCase().includes('p') && hour < 12) {
        hour += 12;
      }

      // Convertir AM
      if (match[2] && match[2].toLowerCase().includes('a') && hour === 12) {
        hour = 0;
      }

      // Validar rango
      if (hour >= 0 && hour <= 23) {
        return `${hour.toString().padStart(2, '0')}:${minute}`;
      }
    }
  }

  return null;
}

/**
 * Sanitiza texto para evitar inyección
 */
function sanitizeText(text) {
  if (typeof text !== 'string') return '';

  return text
    .replace(/[<>]/g, '') // Eliminar < >
    .trim()
    .substring(0, 1000); // Limitar longitud
}

/**
 * Genera un ID único
 */
function generateUniqueId() {
  return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Delay asíncrono
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  isValidWhatsAppNumber,
  formatWhatsAppNumber,
  isValidDate,
  isValidTime,
  formatDateTime,
  extractDateFromText,
  extractTimeFromText,
  sanitizeText,
  generateUniqueId,
  sleep,
};
