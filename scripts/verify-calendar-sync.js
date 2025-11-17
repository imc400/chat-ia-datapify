const { PrismaClient } = require('@prisma/client');
const calendarService = require('../src/services/calendarService');
const prisma = new PrismaClient();

async function verifyCalendarSync() {
  try {
    console.log('🔍 Verificando sincronización con Google Calendar...\n');

    // Obtener 5 leads marcados como agendados
    const scheduledLeads = await prisma.conversation.findMany({
      where: { scheduledMeeting: true },
      take: 5,
      distinct: ['phone'],
      select: {
        phone: true,
        leadData: {
          select: { name: true }
        }
      }
    });

    console.log(`📊 Verificando ${scheduledLeads.length} leads marcados como agendados...\n`);

    for (const lead of scheduledLeads) {
      console.log(`📞 ${lead.phone} (${lead.leadData?.name || 'Sin nombre'})`);
      console.log(`   Estado en BD: scheduledMeeting = true`);

      try {
        const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(lead.phone);
        console.log(`   Estado en Calendar: ${calendarCheck.hasScheduled ? '✅ SÍ tiene eventos' : '❌ NO tiene eventos'}`);
        if (calendarCheck.hasScheduled) {
          console.log(`   Eventos encontrados: ${calendarCheck.eventCount}`);
        }
      } catch (error) {
        console.log(`   Error verificando Calendar: ${error.message}`);
      }
      console.log('');
    }

    // Verificar si hay leads sin agendar que SÍ tienen eventos en Calendar
    console.log('\n🔄 Verificando leads NO agendados que podrían tener eventos...\n');

    const notScheduledLeads = await prisma.conversation.findMany({
      where: { scheduledMeeting: false },
      take: 3,
      distinct: ['phone'],
      select: {
        phone: true,
        leadData: {
          select: { name: true }
        }
      }
    });

    for (const lead of notScheduledLeads) {
      console.log(`📞 ${lead.phone} (${lead.leadData?.name || 'Sin nombre'})`);
      console.log(`   Estado en BD: scheduledMeeting = false`);

      try {
        const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(lead.phone);
        if (calendarCheck.hasScheduled) {
          console.log(`   ⚠️  DESINCRONIZADO: Calendar dice que SÍ tiene ${calendarCheck.eventCount} evento(s)`);
        } else {
          console.log(`   Estado en Calendar: ✅ Correcto, no tiene eventos`);
        }
      } catch (error) {
        console.log(`   Error verificando Calendar: ${error.message}`);
      }
      console.log('');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCalendarSync();
