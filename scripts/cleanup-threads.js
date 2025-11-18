/**
 * SCRIPT: Limpiar threads antiguos de OpenAI
 *
 * Problema: Cuando se cambia de API key, los thread IDs guardados
 * en la BD ya no son válidos en la nueva cuenta de OpenAI.
 *
 * Solución: Poner en null todos los openaiThreadId para que se
 * creen nuevos threads con la nueva API key.
 */

const prisma = require('../src/db/prisma');

async function cleanupThreads() {
  console.log('🧹 Iniciando limpieza de threads antiguos...');

  try {
    // Actualizar todas las conversaciones que tengan openaiThreadId
    const result = await prisma.conversation.updateMany({
      where: {
        openaiThreadId: {
          not: null,
        },
      },
      data: {
        openaiThreadId: null,
      },
    });

    console.log(`✅ ${result.count} threads limpiados exitosamente`);
    console.log('');
    console.log('Los nuevos threads se crearán automáticamente en el próximo mensaje.');

  } catch (error) {
    console.error('❌ Error limpiando threads:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

cleanupThreads();
