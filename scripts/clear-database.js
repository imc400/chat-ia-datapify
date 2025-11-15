const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function clearDatabase() {
  console.log('🗑️  Limpiando base de datos...\n');

  try {
    // Eliminar en orden correcto (respetando foreign keys)

    // 1. Eliminar analytics (dependen de conversations)
    const deletedAnalytics = await prisma.conversationAnalytics.deleteMany({});
    console.log(`✅ Eliminados ${deletedAnalytics.count} registros de ConversationAnalytics`);

    // 2. Eliminar mensajes (dependen de conversations)
    const deletedMessages = await prisma.message.deleteMany({});
    console.log(`✅ Eliminados ${deletedMessages.count} mensajes`);

    // 3. Eliminar conversaciones (dependen de leadData)
    const deletedConversations = await prisma.conversation.deleteMany({});
    console.log(`✅ Eliminadas ${deletedConversations.count} conversaciones`);

    // 4. Eliminar leadData
    const deletedLeads = await prisma.leadData.deleteMany({});
    console.log(`✅ Eliminados ${deletedLeads.count} leads`);

    // 5. Eliminar insights de aprendizaje
    const deletedInsights = await prisma.learningInsight.deleteMany({});
    console.log(`✅ Eliminados ${deletedInsights.count} insights de aprendizaje`);

    // 6. Eliminar versiones de prompts
    const deletedPrompts = await prisma.promptVersion.deleteMany({});
    console.log(`✅ Eliminadas ${deletedPrompts.count} versiones de prompts`);

    console.log('\n🎉 Base de datos limpiada exitosamente!');
    console.log('📊 Lista para recibir tráfico real desde Meta Ads\n');

  } catch (error) {
    console.error('❌ Error limpiando base de datos:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

clearDatabase()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
