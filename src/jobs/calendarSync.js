const { PrismaClient } = require('@prisma/client');
const calendarService = require('../services/calendarService');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * Job de sincronización bidireccional Calendario <-> CRM
 * Se ejecuta cada 10 minutos para mantener sincronizado el estado de agendamiento
 */
class CalendarSyncJob {
  constructor() {
    this.isRunning = false;
    this.intervalMinutes = 10;
    this.interval = null;
  }

  /**
   * Inicia el job de sincronización
   */
  start() {
    logger.info('🔄 Iniciando job de sincronización calendario-CRM', {
      intervalMinutes: this.intervalMinutes,
    });

    // Ejecutar inmediatamente al iniciar
    this.sync();

    // Ejecutar cada X minutos
    this.interval = setInterval(() => {
      this.sync();
    }, this.intervalMinutes * 60 * 1000);
  }

  /**
   * Detiene el job
   */
  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      logger.info('⏹️ Job de sincronización detenido');
    }
  }

  /**
   * Ejecuta la sincronización
   */
  async sync() {
    if (this.isRunning) {
      logger.warn('⚠️ Sincronización ya en progreso, saltando ejecución');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      logger.info('🔄 Iniciando sincronización calendario...');

      // 1. Obtener conversaciones en estado "pending" que NO están marcadas como scheduled
      const pendingConversations = await prisma.conversation.findMany({
        where: {
          OR: [
            {
              outcome: 'pending',
              scheduledMeeting: false,
            },
            {
              outcome: 'pending',
              scheduledMeeting: null,
            },
          ],
          // Solo sincronizar conversaciones de las últimas 48 horas
          updatedAt: {
            gte: new Date(Date.now() - 48 * 60 * 60 * 1000),
          },
        },
        include: {
          leadData: true,
        },
      });

      logger.info(`📋 Encontradas ${pendingConversations.length} conversaciones pending`);

      let syncedCount = 0;
      let errorCount = 0;

      // 2. Verificar cada conversación en Google Calendar
      for (const conversation of pendingConversations) {
        try {
          // Verificar si tiene evento en Google Calendar
          const calendarResult = await calendarService.checkPhoneHasScheduledEvents(
            conversation.phone
          );

          if (calendarResult.hasScheduled && calendarResult.eventCount > 0) {
            // ENCONTRÓ EVENTO: Actualizar conversación a "scheduled"
            await prisma.conversation.update({
              where: { id: conversation.id },
              data: {
                scheduledMeeting: true,
                outcome: 'scheduled',
                status: 'completed',
              },
            });

            syncedCount++;

            logger.info('✅ Conversación sincronizada con calendario', {
              phone: conversation.phone,
              conversationId: conversation.id,
              eventCount: calendarResult.eventCount,
              nextEvent: calendarResult.nextEvent?.start?.dateTime || calendarResult.nextEvent?.start?.date,
            });

            // Si el evento tiene datos del lead, actualizarlos
            if (calendarResult.leadData) {
              const { nombre, apellido, email, sitioWeb } = calendarResult.leadData;

              if (nombre || apellido || email || sitioWeb) {
                await prisma.leadData.updateMany({
                  where: { phone: conversation.phone },
                  data: {
                    ...(nombre && { name: nombre }),
                    ...(email && { email: email }),
                    ...(sitioWeb && { website: sitioWeb }),
                  },
                });

                logger.info('📝 Datos del lead actualizados desde calendario', {
                  phone: conversation.phone,
                  nombre,
                  email,
                  sitioWeb,
                });
              }
            }
          }
        } catch (error) {
          errorCount++;
          logger.error('Error verificando conversación en calendario', {
            phone: conversation.phone,
            conversationId: conversation.id,
            error: error.message,
          });
        }
      }

      const duration = Date.now() - startTime;

      logger.info('✅ Sincronización completada', {
        totalPending: pendingConversations.length,
        synced: syncedCount,
        errors: errorCount,
        durationMs: duration,
      });

      // Guardar métricas de sincronización
      if (syncedCount > 0) {
        logger.info(`📊 ${syncedCount} conversaciones actualizadas a "scheduled"`);
      }

    } catch (error) {
      logger.error('❌ Error en sincronización calendario', {
        error: error.message,
        stack: error.stack,
      });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Sincronización manual (para testing o trigger desde API)
   */
  async syncNow() {
    await this.sync();
  }
}

// Exportar instancia única
const calendarSyncJob = new CalendarSyncJob();
module.exports = calendarSyncJob;
