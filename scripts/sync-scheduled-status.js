const { PrismaClient } = require('@prisma/client');
const calendarService = require('../src/services/calendarService');
const prisma = new PrismaClient();

async function syncScheduledStatus() {
  try {
    console.log('🔄 Sincronizando estado de agendamiento con Google Calendar...\n');

    // Obtener todos los leads únicos (un lead por teléfono)
    const allLeads = await prisma.leadData.findMany({
      select: {
        phone: true,
        name: true,
      }
    });

    console.log(`📊 Total de leads a verificar: ${allLeads.length}\n`);

    let updatedCount = 0;
    let markedAsScheduled = 0;
    let markedAsNotScheduled = 0;
    let errors = 0;

    for (const lead of allLeads) {
      try {
        // Verificar en Google Calendar
        const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(lead.phone);
        const hasScheduledInCalendar = calendarCheck.hasScheduled;

        // Obtener estado actual en BD
        const conversations = await prisma.conversation.findMany({
          where: { phone: lead.phone },
          select: { scheduledMeeting: true },
          take: 1,
        });

        const currentScheduledInDB = conversations.length > 0 ? conversations[0].scheduledMeeting : false;

        // Si el estado es diferente, actualizar
        if (currentScheduledInDB !== hasScheduledInCalendar) {
          // Actualizar todas las conversaciones de este teléfono
          await prisma.conversation.updateMany({
            where: { phone: lead.phone },
            data: { scheduledMeeting: hasScheduledInCalendar },
          });

          updatedCount++;

          if (hasScheduledInCalendar) {
            markedAsScheduled++;
            console.log(`✅ ${lead.phone} (${lead.name || 'Sin nombre'}) - Marcado como AGENDADO (${calendarCheck.eventCount} eventos)`);
          } else {
            markedAsNotScheduled++;
            console.log(`❌ ${lead.phone} (${lead.name || 'Sin nombre'}) - Marcado como NO AGENDADO`);
          }
        } else {
          // Estado correcto, no cambiar
          const icon = hasScheduledInCalendar ? '✅' : '⚪';
          console.log(`${icon} ${lead.phone} (${lead.name || 'Sin nombre'}) - Ya está correcto`);
        }

        // Pequeña pausa para no saturar la API
        await new Promise(resolve => setTimeout(resolve, 100));

      } catch (error) {
        errors++;
        console.error(`❌ Error procesando ${lead.phone}:`, error.message);
      }
    }

    console.log('\n📈 RESUMEN DE SINCRONIZACIÓN:');
    console.log(`   Total de leads procesados: ${allLeads.length}`);
    console.log(`   Leads actualizados: ${updatedCount}`);
    console.log(`   └─ Marcados como agendados: ${markedAsScheduled}`);
    console.log(`   └─ Marcados como NO agendados: ${markedAsNotScheduled}`);
    console.log(`   Errores: ${errors}`);
    console.log(`   Leads ya correctos: ${allLeads.length - updatedCount - errors}`);

    console.log('\n✅ Sincronización completada!');

  } catch (error) {
    console.error('❌ Error en sincronización:', error);
  } finally {
    await prisma.$disconnect();
  }
}

syncScheduledStatus();
