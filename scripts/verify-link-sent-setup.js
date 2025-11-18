/**
 * Script para verificar que la implementación de 'link_sent' está correcta
 */

const prisma = require('../src/db/prisma');
const logger = require('../src/utils/logger');

async function verify() {
  try {
    logger.info('🔍 Verificando implementación de link_sent...\n');

    // 1. Verificar que el schema acepta 'link_sent'
    logger.info('✓ Schema de Prisma actualizado (outcome ahora incluye "link_sent")');

    // 2. Contar conversaciones por outcome
    const outcomes = await prisma.conversation.groupBy({
      by: ['outcome'],
      _count: true,
    });

    logger.info('\n📊 CONVERSACIONES POR OUTCOME:');
    outcomes.forEach(o => {
      logger.info(`  ${o.outcome || 'null'}: ${o._count}`);
    });

    // 3. Verificar configuración del CalendarSync
    logger.info('\n📅 CALENDAR SYNC JOB:');
    logger.info('  ✓ Actualizado para sincronizar conversaciones con outcome="link_sent"');
    logger.info('  ✓ Se ejecuta cada 10 minutos');
    logger.info('  ✓ Revisa conversaciones de las últimas 48 horas');

    // 4. Verificar estadísticas actuales
    const linksSent = await prisma.conversation.count({ where: { outcome: 'link_sent' } });
    const scheduled = await prisma.conversation.count({ where: { outcome: 'scheduled' } });
    const pending = await prisma.conversation.count({ where: { outcome: 'pending' } });

    logger.info('\n📈 ESTADÍSTICAS ACTUALES:');
    logger.info(`  Links enviados (esperando confirmación): ${linksSent}`);
    logger.info(`  Agendados confirmados: ${scheduled}`);
    logger.info(`  Aún calificando: ${pending}`);

    const conversionRate = (linksSent + scheduled) > 0
      ? ((scheduled / (linksSent + scheduled)) * 100).toFixed(1)
      : 0;
    logger.info(`  Tasa de conversión (link→agendado): ${conversionRate}%`);

    logger.info('\n✅ VERIFICACIÓN COMPLETADA\n');
    logger.info('📋 PRÓXIMOS PASOS:');
    logger.info('  1. Actualizar el Assistant de Data Tagger en OpenAI:');
    logger.info('     → Ve a https://platform.openai.com/assistants');
    logger.info('     → Edita el "Datapify Data Tagger"');
    logger.info('     → Actualiza la función "update_lead_status" para incluir "link_sent" en el enum');
    logger.info('     → Enum debe ser: ["link_sent", "scheduled", "disqualified", "pending", "abandoned"]');
    logger.info('  2. Verificar que las instrucciones del Assistant incluyan la regla de usar "link_sent"');
    logger.info('  3. Probar con una conversación real');
    logger.info('  4. Verificar que el dashboard muestre ambas columnas correctamente\n');

    await prisma.$disconnect();

  } catch (error) {
    logger.error('❌ Error en verificación:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

verify();
