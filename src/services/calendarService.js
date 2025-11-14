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
      throw error;
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
