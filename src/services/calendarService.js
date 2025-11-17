const { google } = require('googleapis');
const moment = require('moment-timezone');
const config = require('../config');
const logger = require('../utils/logger');

class CalendarService {
  constructor() {
    this.oauth2Client = new google.auth.OAuth2(
      config.googleCalendar.clientId,
      config.googleCalendar.clientSecret,
      config.googleCalendar.redirectUri
    );

    // Configurar refresh token si existe
    if (config.googleCalendar.refreshToken) {
      this.oauth2Client.setCredentials({
        refresh_token: config.googleCalendar.refreshToken,
      });
    }

    this.calendar = google.calendar({ version: 'v3', auth: this.oauth2Client });
    this.timezone = config.googleCalendar.timezone;
  }

  /**
   * Verifica disponibilidad en una fecha y hora específica
   */
  async checkAvailability(date, time, duration = config.bot.defaultMeetingDuration) {
    try {
      // Parsear fecha y hora
      const startDateTime = moment.tz(`${date} ${time}`, 'YYYY-MM-DD HH:mm', this.timezone);
      const endDateTime = startDateTime.clone().add(duration, 'minutes');

      // Validar horario de negocio
      const hour = startDateTime.hour();
      const dayOfWeek = startDateTime.day();

      if (hour < config.bot.businessHoursStart || hour >= config.bot.businessHoursEnd) {
        return {
          available: false,
          reason: `El horario debe estar entre ${config.bot.businessHoursStart}:00 y ${config.bot.businessHoursEnd}:00`,
        };
      }

      if (!config.bot.workingDays.includes(dayOfWeek)) {
        return {
          available: false,
          reason: 'Solo se agendan reuniones de lunes a viernes',
        };
      }

      // Validar que sea fecha futura
      if (startDateTime.isBefore(moment())) {
        return {
          available: false,
          reason: 'No se pueden agendar reuniones en fechas pasadas',
        };
      }

      // Consultar eventos en ese rango
      const response = await this.calendar.events.list({
        calendarId: config.googleCalendar.calendarId,
        timeMin: startDateTime.toISOString(),
        timeMax: endDateTime.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
      });

      const events = response.data.items || [];

      if (events.length > 0) {
        return {
          available: false,
          reason: 'Ya existe una reunión agendada en ese horario',
          conflicts: events,
        };
      }

      logger.info('✅ Horario disponible', {
        date,
        time,
        duration,
      });

      return {
        available: true,
        startDateTime: startDateTime.toISOString(),
        endDateTime: endDateTime.toISOString(),
      };
    } catch (error) {
      logger.error('Error verificando disponibilidad:', error);
      throw new Error('Error al verificar disponibilidad en el calendario');
    }
  }

  /**
   * Crea un evento en Google Calendar
   */
  async createEvent(meetingData) {
    try {
      const { name, reason, date, time, email, phone, duration } = meetingData;

      // Verificar disponibilidad primero
      const availability = await this.checkAvailability(
        date,
        time,
        duration || config.bot.defaultMeetingDuration
      );

      if (!availability.available) {
        throw new Error(availability.reason);
      }

      // Crear el evento
      const event = {
        summary: `Reunión: ${reason}`,
        description: `Cliente: ${name}\nTeléfono: ${phone || 'No proporcionado'}\nMotivo: ${reason}\n\nAgendado vía WhatsApp Bot`,
        start: {
          dateTime: availability.startDateTime,
          timeZone: this.timezone,
        },
        end: {
          dateTime: availability.endDateTime,
          timeZone: this.timezone,
        },
        attendees: email ? [{ email }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 1 día antes
            { method: 'popup', minutes: 30 }, // 30 minutos antes
          ],
        },
        colorId: '9', // Azul
      };

      const response = await this.calendar.events.insert({
        calendarId: config.googleCalendar.calendarId,
        resource: event,
        sendUpdates: email ? 'all' : 'none',
      });

      logger.info('✅ Evento creado en Google Calendar', {
        eventId: response.data.id,
        name,
        date,
        time,
      });

      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink,
        startDateTime: availability.startDateTime,
        endDateTime: availability.endDateTime,
      };
    } catch (error) {
      logger.error('Error creando evento en calendario:', error);
      throw error;
    }
  }

  /**
   * Obtiene los próximos horarios disponibles
   */
  async getAvailableSlots(daysAhead = 7, slotsPerDay = 5) {
    try {
      const availableSlots = [];
      const now = moment.tz(this.timezone);

      for (let i = 0; i < daysAhead; i++) {
        const checkDate = now.clone().add(i, 'days');

        // Solo días laborables
        if (!config.bot.workingDays.includes(checkDate.day())) {
          continue;
        }

        const dateStr = checkDate.format('YYYY-MM-DD');
        let foundSlots = 0;

        // Revisar horarios del día
        for (let hour = config.bot.businessHoursStart; hour < config.bot.businessHoursEnd && foundSlots < slotsPerDay; hour++) {
          const timeStr = `${hour.toString().padStart(2, '0')}:00`;
          const availability = await this.checkAvailability(dateStr, timeStr);

          if (availability.available) {
            availableSlots.push({
              date: dateStr,
              time: timeStr,
              displayDate: checkDate.format('dddd, DD [de] MMMM'),
              displayTime: `${hour}:00`,
            });
            foundSlots++;
          }
        }
      }

      logger.info('📅 Horarios disponibles obtenidos', {
        count: availableSlots.length,
      });

      return availableSlots;
    } catch (error) {
      logger.error('Error obteniendo horarios disponibles:', error);
      return [];
    }
  }

  /**
   * Extraer datos del formulario desde la descripción del evento
   * Parsea: Nombre, Apellido, Correo, Teléfono, Sitio Web
   */
  extractEventFormData(event) {
    const description = event.description || '';
    const summary = event.summary || '';

    // Patrón para eventos creados por el bot
    // Formato: "Cliente: Juan Pérez\nTeléfono: +56912345678\nMotivo: Demo\n\nAgendado vía WhatsApp Bot"
    const formData = {
      nombre: null,
      apellido: null,
      email: null,
      telefono: null,
      sitioWeb: null,
      source: null, // 'whatsapp_bot' o 'google_appointment' o 'manual'
    };

    // Identificar el origen del evento
    if (description.includes('Agendado vía WhatsApp Bot')) {
      formData.source = 'whatsapp_bot';

      // Extraer nombre completo del campo "Cliente:"
      const nombreMatch = description.match(/Cliente:\s*([^\n]+)/);
      if (nombreMatch) {
        const nombreCompleto = nombreMatch[1].trim();
        const partes = nombreCompleto.split(' ');
        if (partes.length >= 2) {
          formData.nombre = partes[0];
          formData.apellido = partes.slice(1).join(' ');
        } else {
          formData.nombre = nombreCompleto;
        }
      }

      // Extraer teléfono
      const telefonoMatch = description.match(/Teléfono:\s*([^\n]+)/);
      if (telefonoMatch) {
        formData.telefono = telefonoMatch[1].trim();
      }

      // Extraer email de attendees si existe
      if (event.attendees && event.attendees.length > 0) {
        const attendee = event.attendees.find(a => a.email && !a.organizer);
        if (attendee) {
          formData.email = attendee.email;
        }
      }
    }
    // Google Appointment Scheduling tiene estructura diferente
    else if (event.extendedProperties && event.extendedProperties.private) {
      formData.source = 'google_appointment';

      // Google guarda los campos del formulario en extendedProperties
      const props = event.extendedProperties.private;
      formData.nombre = props.firstName || props.nombre || null;
      formData.apellido = props.lastName || props.apellido || null;
      formData.email = props.email || null;
      formData.telefono = props.phone || props.telefono || null;
      formData.sitioWeb = props.website || props.sitioWeb || null;
    }
    // Evento manual o Google Appointment (sin extendedProperties)
    else {
      // Detectar si es Google Appointment por el formato HTML de la descripción
      // Formato: "<b>Programada por</b>\nNombre\nemail\ntelefono\n<br><b>Sitio Web</b>\nwebsite"
      if (description.includes('<b>Programada por</b>')) {
        formData.source = 'google_appointment';

        // Parsear el formato HTML de Google Appointment
        // Ejemplo real:
        // <b>Programada por</b>
        // juan fernando ortega perez
        // jop087@gmail.com
        // 931079702
        // <br><b>Sitio Web</b>
        // Novacompracl

        // Extraer sección entre "Programada por" y "Sitio Web"
        const programadaPorMatch = description.match(/<b>Programada por<\/b>\s*\n([^<]+)/);
        if (programadaPorMatch) {
          const lines = programadaPorMatch[1].trim().split('\n').map(l => l.trim()).filter(l => l);

          // Primera línea: Nombre completo
          if (lines[0]) {
            const nombreCompleto = lines[0];
            const partes = nombreCompleto.split(' ');
            if (partes.length >= 2) {
              formData.nombre = partes[0];
              formData.apellido = partes.slice(1).join(' ');
            } else {
              formData.nombre = nombreCompleto;
            }
          }

          // Segunda línea: Email
          if (lines[1] && lines[1].includes('@')) {
            formData.email = lines[1];
          }

          // Tercera línea: Teléfono (puede tener o no el +56)
          if (lines[2]) {
            // Limpiar el teléfono: solo números
            const phoneClean = lines[2].replace(/[^\d]/g, '');
            // Si tiene 9 dígitos y empieza con 9, es un número chileno sin código
            if (phoneClean.length === 9 && phoneClean.startsWith('9')) {
              formData.telefono = `56${phoneClean}`;
            } else {
              formData.telefono = phoneClean;
            }
          }
        }

        // Extraer sitio web
        const websiteMatch = description.match(/<b>Sitio Web<\/b>\s*\n([^\n<]+)/);
        if (websiteMatch) {
          const website = websiteMatch[1].trim();
          // Solo guardar si no es texto genérico
          if (website && website.length > 3 && !['hola', 'hello', 'hi', 'no', 'ninguno'].includes(website.toLowerCase())) {
            formData.sitioWeb = website;
          }
        }
      } else {
        // Evento manual tradicional
        formData.source = 'manual';

        // Intentar extraer nombre desde el summary
        // Formato común: "Onboarding Datapify (Nombre Apellido)"
        const summaryNameMatch = summary.match(/\(([^)]+)\)/);
        if (summaryNameMatch) {
          const nombreCompleto = summaryNameMatch[1].trim();
          const partes = nombreCompleto.split(' ');
          if (partes.length >= 2) {
            formData.nombre = partes[0];
            formData.apellido = partes.slice(1).join(' ');
          } else {
            formData.nombre = nombreCompleto;
          }
        }

        // Intentar extraer teléfono de la descripción con regex
        const phoneRegex = /\+?\d[\d\s\-()]{8,}/;
        const phoneMatch = description.match(phoneRegex);
        if (phoneMatch) {
          formData.telefono = phoneMatch[0].trim();
        }

        // Extraer email de attendees
        if (event.attendees && event.attendees.length > 0) {
          const attendee = event.attendees.find(a => a.email && !a.organizer);
          if (attendee) {
            formData.email = attendee.email;
          }
        }

        // Intentar extraer website de la descripción
        const websiteMatch = description.match(/<b>Sitio Web<\/b>\s*\n([^\n<]+)/);
        if (websiteMatch) {
          const website = websiteMatch[1].trim();
          if (website && website.length > 3 && !['hola', 'hello', 'hi'].includes(website.toLowerCase())) {
            formData.sitioWeb = website;
          }
        }
      }
    }

    return formData;
  }

  /**
   * Normalizar número de teléfono para comparación
   * Maneja formatos chilenos con/sin código de país
   * 056977788379 → 56977788379
   * +56977788379 → 56977788379
   * 56977788379 → 56977788379
   */
  normalizePhone(phone) {
    if (!phone) return '';

    // Quitar todo excepto números
    let cleaned = phone.replace(/[^\d]/g, '');

    // Quitar ceros iniciales
    cleaned = cleaned.replace(/^0+/, '');

    // Si tiene 11 dígitos y empieza con 56, es formato completo
    // Si tiene 9 dígitos, agregar código de país
    if (cleaned.length === 9) {
      return `56${cleaned}`;
    }

    return cleaned;
  }

  /**
   * Cache para eventos de calendario (evita múltiples llamadas en el mismo ciclo)
   * TTL: 10 minutos
   */
  eventsCache = {
    data: null,
    timestamp: null,
    ttl: 10 * 60 * 1000, // 10 minutos
  };

  /**
   * Obtener TODOS los eventos futuros (con caché de 10 minutos)
   * OPTIMIZACIÓN: Hace 1 sola llamada a la API en lugar de N llamadas
   */
  async getAllFutureEvents() {
    try {
      const now = Date.now();

      // Si el cache es válido, retornar datos cacheados
      if (this.eventsCache.data && this.eventsCache.timestamp && (now - this.eventsCache.timestamp) < this.eventsCache.ttl) {
        logger.info('🔄 Usando eventos cacheados', {
          cacheAge: Math.round((now - this.eventsCache.timestamp) / 1000) + 's',
          eventCount: this.eventsCache.data.length,
        });
        return this.eventsCache.data;
      }

      // Cache expiró, buscar todos los eventos
      const momentNow = moment.tz(this.timezone);
      const futureLimit = momentNow.clone().add(60, 'days');

      logger.info('📅 Obteniendo TODOS los eventos futuros (próximos 60 días)...');

      const response = await this.calendar.events.list({
        calendarId: config.googleCalendar.calendarId,
        timeMin: momentNow.toISOString(),
        timeMax: futureLimit.toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        maxResults: 2500, // Google Calendar API permite max 2500
      });

      const events = response.data.items || [];

      // Actualizar cache
      this.eventsCache.data = events;
      this.eventsCache.timestamp = now;

      logger.info('✅ Eventos obtenidos y cacheados', {
        eventCount: events.length,
        cacheTTL: this.eventsCache.ttl / 1000 + 's',
      });

      return events;
    } catch (error) {
      logger.error('❌ Error obteniendo eventos de calendario:', error.message);

      // Si hay error pero tenemos cache, retornar cache aunque esté expirado
      if (this.eventsCache.data) {
        logger.warn('⚠️ Usando cache expirado por error de API');
        return this.eventsCache.data;
      }

      return [];
    }
  }

  /**
   * Verificar si un teléfono tiene eventos agendados en Google Calendar
   * Busca eventos futuros que contengan el teléfono en la descripción
   * AHORA extrae y valida los datos del formulario de cada evento
   * MEJORA: Normaliza números para buscar todas las variantes
   * OPTIMIZACIÓN CRÍTICA: Usa cache de eventos en lugar de 6 búsquedas por teléfono
   */
  async checkPhoneHasScheduledEvents(phone) {
    try {
      // Normalizar el teléfono de búsqueda
      const normalizedSearchPhone = this.normalizePhone(phone);

      // Extraer solo los 9 dígitos locales (sin código de país)
      const localPhone = normalizedSearchPhone.startsWith('56') && normalizedSearchPhone.length === 11
        ? normalizedSearchPhone.slice(2)
        : normalizedSearchPhone;

      // Generar variantes del número para comparación local
      const phoneVariants = [
        phone,                          // Original
        normalizedSearchPhone,          // 56977788379
        `0${normalizedSearchPhone}`,    // 056977788379 (con cero inicial)
        `+${normalizedSearchPhone}`,    // +56977788379
        localPhone,                     // 977788379 (solo local)
        `0${localPhone}`,               // 0977788379 (local con cero)
      ];

      logger.info('🔍 Buscando eventos para teléfono', {
        originalPhone: phone,
        normalizedPhone: normalizedSearchPhone,
      });

      // OPTIMIZACIÓN: Obtener TODOS los eventos (con cache) en lugar de buscar 6 veces
      const allEvents = await this.getAllFutureEvents();

      if (!allEvents || allEvents.length === 0) {
        logger.info('❌ No hay eventos futuros en el calendario');
        return {
          hasScheduled: false,
          eventCount: 0,
        };
      }

      // Filtrar y enriquecer eventos que contengan alguna variante del teléfono
      const matchingEvents = allEvents
        .map(event => {
          const formData = this.extractEventFormData(event);

          // Normalizar teléfonos para comparación
          const eventPhone = this.normalizePhone(formData.telefono);

          // Extraer los últimos 9 dígitos de ambos números para comparación robusta
          const searchLast9 = normalizedSearchPhone.slice(-9);
          const eventLast9 = eventPhone.slice(-9);

          // Verificar si el teléfono coincide con alguna variante
          const phoneMatches =
            eventPhone === normalizedSearchPhone ||
            eventPhone.includes(normalizedSearchPhone) ||
            normalizedSearchPhone.includes(eventPhone) ||
            (searchLast9.length === 9 && eventLast9.length === 9 && searchLast9 === eventLast9) ||
            // También verificar si la descripción contiene alguna variante
            phoneVariants.some(variant => {
              const desc = (event.description || '').toLowerCase();
              const summary = (event.summary || '').toLowerCase();
              return desc.includes(variant.toLowerCase()) || summary.includes(variant.toLowerCase());
            });

          return {
            ...event,
            formData,
            phoneMatches,
            debugInfo: {
              eventPhone,
              normalizedSearchPhone,
              searchLast9,
              eventLast9
            }
          };
        })
        .filter(event => event.phoneMatches);

      if (matchingEvents.length > 0) {
        logger.info('✅ Teléfono tiene eventos agendados', {
          phone,
          normalizedPhone: normalizedSearchPhone,
          eventCount: matchingEvents.length,
          nextEvent: matchingEvents[0].start.dateTime || matchingEvents[0].start.date,
          extractedData: matchingEvents[0].formData,
        });

        return {
          hasScheduled: true,
          eventCount: matchingEvents.length,
          nextEvent: matchingEvents[0],
          allEvents: matchingEvents,
          // Datos del primer evento para referencia
          leadData: matchingEvents[0].formData,
        };
      }

      logger.info('❌ No se encontraron eventos para el teléfono', {
        phone,
        normalizedPhone: normalizedSearchPhone,
        totalEventsChecked: allEvents.length,
      });

      return {
        hasScheduled: false,
        eventCount: 0,
      };

    } catch (error) {
      logger.error('Error verificando eventos en calendario:', {
        phone,
        error: error.message,
      });

      // Si hay error, retornar false para no bloquear el flujo
      return {
        hasScheduled: false,
        eventCount: 0,
        error: error.message,
      };
    }
  }


  /**
   * Cancela un evento
   */
  async cancelEvent(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: config.googleCalendar.calendarId,
        eventId: eventId,
        sendUpdates: 'all',
      });

      logger.info('✅ Evento cancelado', { eventId });

      return { success: true };
    } catch (error) {
      logger.error('Error cancelando evento:', error);
      throw error;
    }
  }
}

module.exports = new CalendarService();
