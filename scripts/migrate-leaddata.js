/**
 * Script de migración manual: Consolidar LeadData por teléfono
 *
 * PROBLEMA: Actualmente hay múltiples LeadData por teléfono (uno por conversación)
 * SOLUCIÓN: Consolidar en un único LeadData por teléfono
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateLeadData() {
  console.log('🚀 Iniciando migración de LeadData...\n');

  try {
    // Paso 1: Obtener todos los teléfonos únicos
    const conversations = await prisma.conversation.findMany({
      select: { phone: true },
      distinct: ['phone'],
    });

    console.log(`📊 Teléfonos únicos encontrados: ${conversations.length}\n`);

    for (const { phone } of conversations) {
      console.log(`\n📱 Procesando teléfono: ${phone}`);

      // Paso 2: Obtener todas las conversaciones de este teléfono
      const phoneConversations = await prisma.conversation.findMany({
        where: { phone },
        include: { leadData: true },
        orderBy: { updatedAt: 'desc' },
      });

      console.log(`  - Conversaciones: ${phoneConversations.length}`);

      // Paso 3: Consolidar LeadData (buscar el más completo/reciente)
      const existingLeads = phoneConversations
        .map(c => c.leadData)
        .filter(Boolean);

      console.log(`  - LeadData existentes: ${existingLeads.length}`);

      if (existingLeads.length === 0) {
        console.log(`  ⏭️  Sin LeadData, creando uno nuevo...`);

        // Crear un LeadData para este teléfono
        const newLead = await prisma.leadData.create({
          data: {
            phone,
            // Copiar datos del primer conversation si tiene
            name: phoneConversations[0]?.leadData?.name || null,
            hasShopify: phoneConversations[0]?.leadData?.hasShopify || null,
          },
        });

        // Actualizar todas las conversaciones para apuntar a este lead
        await prisma.conversation.updateMany({
          where: { phone },
          data: { leadDataId: newLead.id },
        });

        console.log(`  ✅ Creado nuevo LeadData: ${newLead.id}`);
        continue;
      }

      // Paso 4: Encontrar el LeadData "maestro" (el más completo/reciente)
      const masterLead = existingLeads.reduce((best, current) => {
        // Priorizar el que tenga más campos completos
        const bestScore = [best.name, best.email, best.website, best.lastName, best.hasShopify].filter(Boolean).length;
        const currentScore = [current.name, current.email, current.website, current.lastName, current.hasShopify].filter(Boolean).length;

        return currentScore > bestScore ? current : best;
      });

      console.log(`  🏆 Lead maestro seleccionado: ${masterLead.id}`);

      // Paso 5: Consolidar datos de todos los leads en el maestro
      const consolidatedData = {
        name: existingLeads.find(l => l.name)?.name || masterLead.name,
        lastName: existingLeads.find(l => l.lastName)?.lastName || masterLead.lastName,
        email: existingLeads.find(l => l.email)?.email || masterLead.email,
        website: existingLeads.find(l => l.website)?.website || masterLead.website,
        hasShopify: existingLeads.find(l => l.hasShopify !== null)?.hasShopify ?? masterLead.hasShopify,
        businessType: existingLeads.find(l => l.businessType)?.businessType || masterLead.businessType,
        investsInAds: existingLeads.find(l => l.investsInAds !== null)?.investsInAds ?? masterLead.investsInAds,
        monthlyRevenueCLP: existingLeads.find(l => l.monthlyRevenueCLP)?.monthlyRevenueCLP || masterLead.monthlyRevenueCLP,
        adSpendMonthlyCLP: existingLeads.find(l => l.adSpendMonthlyCLP)?.adSpendMonthlyCLP || masterLead.adSpendMonthlyCLP,
        location: existingLeads.find(l => l.location)?.location || masterLead.location,
        painPoints: existingLeads.find(l => l.painPoints)?.painPoints || masterLead.painPoints,
        qualificationSignals: existingLeads.find(l => l.qualificationSignals)?.qualificationSignals || masterLead.qualificationSignals,
        calendarSyncedAt: existingLeads.find(l => l.calendarSyncedAt)?.calendarSyncedAt || masterLead.calendarSyncedAt,
        conversionStatus: existingLeads.find(l => l.conversionStatus)?.conversionStatus || masterLead.conversionStatus,
        conversionDate: existingLeads.find(l => l.conversionDate)?.conversionDate || masterLead.conversionDate,
        conversionNotes: existingLeads.find(l => l.conversionNotes)?.conversionNotes || masterLead.conversionNotes,
      };

      // Paso 6: Actualizar el lead maestro con datos consolidados
      await prisma.leadData.update({
        where: { id: masterLead.id },
        data: { ...consolidatedData, phone }, // Asegurar que tenga el phone
      });

      console.log(`  💾 Datos consolidados guardados`);

      // Paso 7: Actualizar todas las conversaciones para apuntar al lead maestro
      await prisma.conversation.updateMany({
        where: { phone },
        data: { leadDataId: masterLead.id },
      });

      console.log(`  🔗 ${phoneConversations.length} conversaciones actualizadas`);

      // Paso 8: Eliminar los leads duplicados
      const duplicateLeadIds = existingLeads
        .filter(l => l.id !== masterLead.id)
        .map(l => l.id);

      if (duplicateLeadIds.length > 0) {
        await prisma.leadData.deleteMany({
          where: { id: { in: duplicateLeadIds } },
        });
        console.log(`  🗑️  ${duplicateLeadIds.length} leads duplicados eliminados`);
      }

      console.log(`  ✅ Teléfono ${phone} consolidado exitosamente`);
    }

    console.log('\n\n✨ ¡Migración completada exitosamente!\n');
    console.log('📊 Resumen:');

    const totalLeads = await prisma.leadData.count();
    const totalConversations = await prisma.conversation.count();

    console.log(`  - Total Leads únicos: ${totalLeads}`);
    console.log(`  - Total Conversaciones: ${totalConversations}`);
    console.log(`  - Promedio conversaciones por lead: ${(totalConversations / totalLeads).toFixed(2)}`);

  } catch (error) {
    console.error('❌ Error durante la migración:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Ejecutar migración
migrateLeadData()
  .then(() => {
    console.log('\n✅ Proceso terminado exitosamente');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Proceso terminado con errores:', error);
    process.exit(1);
  });
