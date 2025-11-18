/**
 * SCRIPT: Re-etiquetar todas las conversaciones históricas
 *
 * Este script procesa todas las conversaciones existentes en la BD
 * y las pasa por el Data Tagger para etiquetar automáticamente:
 * - hasShopify
 * - monthlyRevenueCLP
 * - investsInAds
 * - painPoints
 * - leadScore
 * - leadTemperature
 * - outcome
 *
 * Uso: node scripts/retag-all-conversations.js
 */

const prisma = require('../src/db/prisma');
const dataTaggerService = require('../src/services/dataTaggerService');
const logger = require('../src/utils/logger');

async function retagAllConversations() {
  try {
    logger.info('🚀 Iniciando re-etiquetado de conversaciones históricas...');

    // 1. Obtener todas las conversaciones con sus mensajes
    const conversations = await prisma.conversation.findMany({
      include: {
        messages: {
          orderBy: { timestamp: 'asc' },
        },
        leadData: true,
      },
      orderBy: { startedAt: 'asc' },
    });

    logger.info(`📊 Total de conversaciones encontradas: ${conversations.length}`);

    let processed = 0;
    let successful = 0;
    let failed = 0;
    let skipped = 0;

    // 2. Procesar cada conversación
    for (const conversation of conversations) {
      processed++;

      // Saltar conversaciones sin mensajes
      if (conversation.messages.length === 0) {
        logger.warn(`⏭️ Saltando conversación sin mensajes: ${conversation.id}`);
        skipped++;
        continue;
      }

      logger.info(`\n[${processed}/${conversations.length}] 🔄 Procesando conversación ${conversation.id}`);
      logger.info(`  📱 Teléfono: ${conversation.phone}`);
      logger.info(`  💬 Mensajes: ${conversation.messages.length}`);

      try {
        // 3. Construir historial completo
        const history = conversation.messages.map(msg => ({
          role: msg.role === 'user' ? 'usuario' : 'asistente',
          content: msg.content,
        }));

        // 4. Obtener el último mensaje del usuario
        const lastUserMessage = conversation.messages
          .filter(m => m.role === 'user')
          .pop();

        if (!lastUserMessage) {
          logger.warn(`  ⏭️ No hay mensajes de usuario, saltando...`);
          skipped++;
          continue;
        }

        // 5. Ejecutar Data Tagger con todo el historial
        logger.info(`  🏷️ Ejecutando Data Tagger...`);
        const result = await dataTaggerService.analyzeAndTag(
          lastUserMessage.content,
          conversation.id,
          history
        );

        if (result.success) {
          logger.info(`  ✅ Etiquetado exitoso`);
          logger.info(`     - Tool calls ejecutados: ${result.toolCallsExecuted}`);
          logger.info(`     - Tiempo de procesamiento: ${result.processingTime}ms`);
          successful++;
        } else {
          logger.warn(`  ⚠️ Etiquetado falló: ${result.error}`);
          failed++;
        }

        // Pequeña pausa para no saturar OpenAI API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        logger.error(`  ❌ Error procesando conversación ${conversation.id}:`, error.message);
        failed++;
      }
    }

    // 6. Resumen final
    logger.info('\n\n========================================');
    logger.info('📊 RESUMEN DE RE-ETIQUETADO');
    logger.info('========================================');
    logger.info(`Total conversaciones: ${conversations.length}`);
    logger.info(`✅ Exitosas: ${successful}`);
    logger.info(`❌ Fallidas: ${failed}`);
    logger.info(`⏭️ Saltadas: ${skipped}`);
    logger.info('========================================\n');

    // 7. Mostrar estadísticas de leads etiquetados
    const leadsWithShopify = await prisma.leadData.count({
      where: { hasShopify: true },
    });

    const leadsWithoutShopify = await prisma.leadData.count({
      where: { hasShopify: false },
    });

    const hotLeads = await prisma.conversation.count({
      where: { leadTemperature: 'hot' },
    });

    const warmLeads = await prisma.conversation.count({
      where: { leadTemperature: 'warm' },
    });

    const coldLeads = await prisma.conversation.count({
      where: { leadTemperature: 'cold' },
    });

    logger.info('📈 ESTADÍSTICAS DE LEADS');
    logger.info('========================================');
    logger.info(`Leads con Shopify: ${leadsWithShopify}`);
    logger.info(`Leads sin Shopify: ${leadsWithoutShopify}`);
    logger.info(`Leads HOT 🔥: ${hotLeads}`);
    logger.info(`Leads WARM 🌡️: ${warmLeads}`);
    logger.info(`Leads COLD ❄️: ${coldLeads}`);
    logger.info('========================================\n');

    await prisma.$disconnect();

  } catch (error) {
    logger.error('❌ Error fatal en re-etiquetado:', error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

// Ejecutar script
retagAllConversations();
