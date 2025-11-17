const { google } = require('googleapis');
const moment = require('moment-timezone');
const config = require('../src/config');

async function listRecentEvents() {
  console.log('📅 Listando eventos recientes de Google Calendar...\n');

  try {
    const oauth2Client = new google.auth.OAuth2(
      config.googleCalendar.clientId,
      config.googleCalendar.clientSecret,
      config.googleCalendar.redirectUri
    );

    if (config.googleCalendar.refreshToken) {
      oauth2Client.setCredentials({
        refresh_token: config.googleCalendar.refreshToken,
      });
    }

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const now = moment();
    const futureLimit = now.clone().add(30, 'days');

    console.log(`🔍 Buscando eventos entre ${now.format('YYYY-MM-DD')} y ${futureLimit.format('YYYY-MM-DD')}\n`);

    const response = await calendar.events.list({
      calendarId: config.googleCalendar.calendarId,
      timeMin: now.toISOString(),
      timeMax: futureLimit.toISOString(),
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 20,
    });

    const events = response.data.items || [];

    console.log(`✅ Encontrados ${events.length} eventos\n`);

    if (events.length === 0) {
      console.log('❌ No hay eventos agendados en los próximos 30 días\n');
      return;
    }

    events.forEach((event, index) => {
      console.log(`\n========== EVENTO ${index + 1} ==========`);
      console.log(`📌 ID: ${event.id}`);
      console.log(`📋 Summary: ${event.summary || 'Sin título'}`);
      console.log(`📅 Fecha: ${event.start.dateTime || event.start.date}`);

      if (event.description) {
        console.log(`\n📝 Description (primeros 500 chars):`);
        console.log(event.description.substring(0, 500));
        if (event.description.length > 500) {
          console.log('... (truncado)');
        }
      } else {
        console.log(`📝 Description: (vacía)`);
      }

      if (event.attendees && event.attendees.length > 0) {
        console.log(`\n👥 Attendees:`);
        event.attendees.forEach(att => {
          console.log(`   - ${att.email}${att.organizer ? ' (organizador)' : ''}`);
        });
      }

      if (event.extendedProperties) {
        console.log(`\n🔧 Extended Properties:`);
        if (event.extendedProperties.private) {
          console.log(`   Private:`, event.extendedProperties.private);
        }
        if (event.extendedProperties.shared) {
          console.log(`   Shared:`, event.extendedProperties.shared);
        }
      }

      // Buscar cualquier cosa que parezca un teléfono
      const phoneRegex = /\+?\d[\d\s\-()]{8,}/g;
      const fullText = `${event.summary || ''} ${event.description || ''}`;
      const possiblePhones = fullText.match(phoneRegex);

      if (possiblePhones && possiblePhones.length > 0) {
        console.log(`\n📱 TELÉFONOS DETECTADOS EN EL TEXTO:`);
        possiblePhones.forEach(phone => {
          console.log(`   - ${phone}`);
        });
      } else {
        console.log(`\n📱 TELÉFONOS DETECTADOS: Ninguno`);
      }

      console.log(`\n========================================`);
    });

    console.log('\n\n🎯 RESUMEN DE BÚSQUEDA:');
    console.log(`Total de eventos: ${events.length}`);
    const eventsWithPhones = events.filter(e => {
      const fullText = `${e.summary || ''} ${e.description || ''}`;
      return /\+?\d[\d\s\-()]{8,}/.test(fullText);
    });
    console.log(`Eventos con teléfonos: ${eventsWithPhones.length}`);
    console.log('\n✅ Análisis completo\n');

  } catch (error) {
    console.error('❌ Error listando eventos:', error.message);
    if (error.response && error.response.data) {
      console.error('Detalles:', error.response.data);
    }
    throw error;
  }
}

listRecentEvents()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
