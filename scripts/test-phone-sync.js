const calendarService = require('../src/services/calendarService');

// Teléfonos de los eventos que vimos en el calendario
// (números SIN el +56 como aparecen en Google Calendar)
const testPhones = [
  '56931079702',  // juan fernando ortega perez
  '56966343752',  // Cristian Vilches
  '56942074639',  // Allan Gasken
  '56992517351',  // María Teresa Escalona
  '56971607644',  // Juanjo Blanco
];

async function testPhoneSync() {
  console.log('🧪 Probando sincronización de teléfonos con calendario\n');

  for (const phone of testPhones) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📱 Testeando: ${phone}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const result = await calendarService.checkPhoneHasScheduledEvents(phone);

      if (result.hasScheduled) {
        console.log(`✅ ENCONTRADO - Tiene eventos agendados`);
        console.log(`   📊 Total eventos: ${result.eventCount}`);
        console.log(`   📅 Próximo evento: ${result.nextEvent.start.dateTime || result.nextEvent.start.date}`);
        console.log(`   📋 Summary: ${result.nextEvent.summary}`);

        if (result.leadData) {
          console.log(`\n   📝 Datos extraídos:`);
          console.log(`      Nombre: ${result.leadData.nombre || 'N/A'}`);
          console.log(`      Apellido: ${result.leadData.apellido || 'N/A'}`);
          console.log(`      Email: ${result.leadData.email || 'N/A'}`);
          console.log(`      Teléfono: ${result.leadData.telefono || 'N/A'}`);
          console.log(`      Sitio Web: ${result.leadData.sitioWeb || 'N/A'}`);
          console.log(`      Source: ${result.leadData.source || 'N/A'}`);
        }
      } else {
        console.log(`❌ NO ENCONTRADO - Sin eventos`);
        if (result.error) {
          console.log(`   ⚠️ Error: ${result.error}`);
        }
      }

    } catch (error) {
      console.error(`❌ ERROR: ${error.message}`);
    }
  }

  console.log(`\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log('✅ Test completo');
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

testPhoneSync()
  .catch((error) => {
    console.error('💥 Error fatal:', error);
    process.exit(1);
  });
