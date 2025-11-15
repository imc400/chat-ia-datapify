const express = require('express');
const router = express.Router();
const calendarService = require('../services/calendarService');
const logger = require('../utils/logger');

/**
 * Endpoint de prueba para ver eventos del calendario
 * GET /test-calendar?days=7
 */
router.get('/', async (req, res) => {
  try {
    const { days = 30, past = false } = req.query;

    const { google } = require('googleapis');
    const config = require('../config');
    const moment = require('moment-timezone');

    const oauth2Client = new google.auth.OAuth2(
      config.googleCalendar.clientId,
      config.googleCalendar.clientSecret,
      config.googleCalendar.redirectUri
    );

    oauth2Client.setCredentials({
      refresh_token: config.googleCalendar.refreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = moment.tz(config.googleCalendar.timezone);

    let timeMin, timeMax;
    if (past === 'true') {
      // Ver eventos pasados
      timeMin = now.clone().subtract(parseInt(days), 'days').toISOString();
      timeMax = now.toISOString();
    } else {
      // Ver eventos futuros
      timeMin = now.toISOString();
      timeMax = now.clone().add(parseInt(days), 'days').toISOString();
    }

    const response = await calendar.events.list({
      calendarId: config.googleCalendar.calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 10,
    });

    const events = response.data.items || [];

    // Formatear eventos para ver la estructura
    const formatted = events.map(event => ({
      id: event.id,
      summary: event.summary,
      description: event.description,
      start: event.start,
      end: event.end,
      created: event.created,
      status: event.status,
      attendees: event.attendees,
      organizer: event.organizer,
      htmlLink: event.htmlLink,
      extendedProperties: event.extendedProperties,
    }));

    res.json({
      success: true,
      count: formatted.length,
      events: formatted,
    });

  } catch (error) {
    logger.error('Error en test-calendar:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

module.exports = router;
