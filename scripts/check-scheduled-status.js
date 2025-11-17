const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkScheduledStatus() {
  try {
    console.log('🔍 Verificando estado de scheduledMeeting...\n');

    // Obtener todas las conversaciones únicas por teléfono
    const conversations = await prisma.conversation.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 30,
      select: {
        phone: true,
        scheduledMeeting: true,
        outcome: true,
        leadTemperature: true,
        leadData: {
          select: {
            name: true,
            hasShopify: true,
          }
        }
      }
    });

    // Agrupar por teléfono
    const grouped = {};
    conversations.forEach(conv => {
      if (!grouped[conv.phone]) {
        grouped[conv.phone] = conv;
      }
    });

    console.log('📊 ESTADO DE CONVERSACIONES:');
    console.log(`Total teléfonos únicos: ${Object.keys(grouped).length}\n`);

    let scheduledCount = 0;
    let notScheduledCount = 0;

    Object.values(grouped).forEach(conv => {
      const isScheduled = conv.scheduledMeeting;
      if (isScheduled) scheduledCount++;
      else notScheduledCount++;

      const icon = isScheduled ? '📅' : '❌';
      console.log(`${icon} ${conv.phone}`);
      console.log(`   Nombre: ${conv.leadData?.name || 'Sin nombre'}`);
      console.log(`   scheduledMeeting: ${isScheduled}`);
      console.log(`   outcome: ${conv.outcome}`);
      console.log(`   temperature: ${conv.leadTemperature}`);
      console.log(`   hasShopify: ${conv.leadData?.hasShopify || false}`);
      console.log('');
    });

    console.log('📈 RESUMEN:');
    console.log(`   ✅ Con reunión agendada: ${scheduledCount}`);
    console.log(`   ❌ Sin reunión agendada: ${notScheduledCount}`);
    console.log(`   📊 Porcentaje agendados: ${((scheduledCount / Object.keys(grouped).length) * 100).toFixed(1)}%`);

    if (scheduledCount === Object.keys(grouped).length) {
      console.log('\n⚠️  ALERTA: TODOS los leads están marcados como agendados!');
      console.log('   Esto sugiere un problema en la sincronización con Google Calendar.');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkScheduledStatus();
