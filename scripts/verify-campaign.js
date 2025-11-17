const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function verifyCampaign() {
  try {
    console.log('🔍 Verificando última campaña...\n');

    // 1. Obtener la campaña más reciente
    const campaign = await prisma.campaign.findFirst({
      orderBy: { createdAt: 'desc' },
      include: {
        recipients: {
          orderBy: { sentAt: 'desc' }
        }
      }
    });

    if (!campaign) {
      console.log('❌ No se encontraron campañas en la base de datos.');
      return;
    }

    console.log('📊 CAMPAÑA ENCONTRADA:');
    console.log(`   Nombre: ${campaign.name}`);
    console.log(`   ID: ${campaign.id}`);
    console.log(`   Creada: ${campaign.createdAt.toLocaleString('es-CL')}`);
    console.log(`   Estado: ${campaign.status}`);
    console.log(`   Total destinatarios: ${campaign.totalRecipients}`);
    console.log(`   Enviados exitosamente: ${campaign.sentCount}`);
    console.log(`   Fallidos: ${campaign.failedCount}\n`);

    // 2. Verificar destinatarios
    console.log('👥 DESTINATARIOS:');
    for (const recipient of campaign.recipients) {
      const statusIcon = recipient.status === 'sent' ? '✅' : '❌';
      console.log(`   ${statusIcon} ${recipient.phone} (${recipient.leadName || 'Sin nombre'})`);
      console.log(`      Estado: ${recipient.status}`);
      if (recipient.messageId) {
        console.log(`      WhatsApp Message ID: ${recipient.messageId}`);
      }
      if (recipient.sentAt) {
        console.log(`      Enviado: ${recipient.sentAt.toLocaleString('es-CL')}`);
      }
      if (recipient.errorMessage) {
        console.log(`      Error: ${recipient.errorMessage}`);
      }
      console.log('');
    }

    // 3. Verificar mensajes en la BD (tabla Message a través de Conversation)
    const messageCount = await prisma.message.count({
      where: {
        conversation: {
          phone: {
            in: campaign.recipients.map(r => r.phone)
          }
        },
        role: 'assistant', // Los mensajes enviados por el bot son 'assistant'
        timestamp: {
          gte: new Date(campaign.createdAt.getTime() - 60000), // 1 minuto antes de la campaña
          lte: new Date(campaign.createdAt.getTime() + 600000) // 10 minutos después
        }
      }
    });

    console.log('💬 VERIFICACIÓN EN HISTORIAL DE MENSAJES:');
    console.log(`   Mensajes outgoing encontrados: ${messageCount}\n`);

    // 4. Resumen final
    console.log('📈 RESUMEN:');
    const successRate = ((campaign.sentCount / campaign.totalRecipients) * 100).toFixed(1);
    console.log(`   ✅ Tasa de éxito: ${successRate}%`);
    console.log(`   📤 Mensajes enviados a WhatsApp API: ${campaign.sentCount}/${campaign.totalRecipients}`);
    console.log(`   💾 Mensajes guardados en BD: ${messageCount}`);

    const hasMessageIds = campaign.recipients.filter(r => r.messageId).length;
    console.log(`   🆔 Recipients con WhatsApp Message ID: ${hasMessageIds}/${campaign.recipients.length}`);

    if (campaign.sentCount === campaign.totalRecipients && hasMessageIds === campaign.totalRecipients) {
      console.log('\n✨ VERIFICACIÓN EXITOSA: Todos los mensajes fueron enviados correctamente.');
    } else if (campaign.failedCount > 0) {
      console.log(`\n⚠️  ADVERTENCIA: ${campaign.failedCount} mensaje(s) fallaron.`);
    }

  } catch (error) {
    console.error('❌ Error al verificar campaña:', error);
  } finally {
    await prisma.$disconnect();
  }
}

verifyCampaign();
