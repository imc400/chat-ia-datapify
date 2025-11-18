const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

/**
 * Prisma Client Singleton
 *
 * PROBLEMA RESUELTO:
 * - Antes: Cada archivo creaba su propia instancia de PrismaClient
 * - Esto causaba memory leaks y agotamiento de conexiones
 *
 * SOLUCIÓN:
 * - Una única instancia compartida globalmente
 * - En desarrollo: usa global.prisma para hot-reload
 * - En producción: instancia única optimizada
 *
 * IMPORTANTE:
 * - SIEMPRE importar desde aquí: const prisma = require('./db/prisma');
 * - NUNCA crear new PrismaClient() en otros archivos
 */

let prisma;

if (process.env.NODE_ENV === 'production') {
  // PRODUCCIÓN: Instancia única optimizada
  prisma = new PrismaClient({
    log: ['error', 'warn'],
    errorFormat: 'minimal',
  });

  logger.info('✅ Prisma Client inicializado en modo PRODUCCIÓN');
} else {
  // DESARROLLO: Usar global para evitar múltiples instancias en hot-reload
  if (!global.prisma) {
    global.prisma = new PrismaClient({
      log: ['query', 'error', 'warn'],
      errorFormat: 'pretty',
    });

    logger.info('✅ Prisma Client inicializado en modo DESARROLLO (con logging)');
  }

  prisma = global.prisma;
}

// Manejo de errores de conexión
prisma.$connect().catch((err) => {
  logger.error('❌ Error conectando a la base de datos:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('🔌 Desconectando Prisma Client...');
  await prisma.$disconnect();
});

module.exports = prisma;
