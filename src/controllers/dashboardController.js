const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const calendarService = require('../services/calendarService');

const prisma = new PrismaClient();

class DashboardController {
  /**
   * Obtener todas las conversaciones AGRUPADAS POR TELÉFONO
   */
  async getConversations(req, res) {
    try {
      const { status, temperature, limit = 50, offset = 0 } = req.query;

      const where = {};
      if (status) where.status = status;
      if (temperature) where.leadTemperature = temperature;

      // Obtener todas las conversaciones
      const allConversations = await prisma.conversation.findMany({
        where,
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 1, // Solo el último mensaje para preview
          },
          leadData: true,
          analytics: true,
        },
        orderBy: { updatedAt: 'desc' },
      });

      // Agrupar por teléfono
      const groupedByPhone = {};
      allConversations.forEach(conv => {
        if (!groupedByPhone[conv.phone]) {
          groupedByPhone[conv.phone] = {
            phone: conv.phone,
            conversations: [],
            lastMessage: null,
            lastUpdate: conv.updatedAt,
            totalMessages: 0,
            leadData: null,
            leadTemperature: conv.leadTemperature,
            leadScore: conv.leadScore,
            scheduledMeeting: false,
          };
        }

        groupedByPhone[conv.phone].conversations.push(conv);
        groupedByPhone[conv.phone].totalMessages += conv.analytics?.totalMessages || 0;

        // Actualizar última actividad si es más reciente
        if (new Date(conv.updatedAt) > new Date(groupedByPhone[conv.phone].lastUpdate)) {
          groupedByPhone[conv.phone].lastUpdate = conv.updatedAt;
          groupedByPhone[conv.phone].lastMessage = conv.messages[0] || null;
        }

        // Tomar el leadData más reciente
        if (conv.leadData && (!groupedByPhone[conv.phone].leadData ||
            new Date(conv.leadData.updatedAt) > new Date(groupedByPhone[conv.phone].leadData.updatedAt))) {
          groupedByPhone[conv.phone].leadData = conv.leadData;
        }

        // Tomar la mejor temperatura (hot > warm > cold)
        const tempPriority = { hot: 3, warm: 2, cold: 1 };
        if (tempPriority[conv.leadTemperature] > tempPriority[groupedByPhone[conv.phone].leadTemperature]) {
          groupedByPhone[conv.phone].leadTemperature = conv.leadTemperature;
        }

        // Tomar el mejor leadScore
        if (conv.leadScore > groupedByPhone[conv.phone].leadScore) {
          groupedByPhone[conv.phone].leadScore = conv.leadScore;
        }

        // Si alguna conversación tiene reunión agendada, marcar
        if (conv.scheduledMeeting) {
          groupedByPhone[conv.phone].scheduledMeeting = true;
        }
      });

      // Convertir a array y ordenar por última actividad
      const grouped = Object.values(groupedByPhone)
        .sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate));

      // Aplicar paginación
      const paginated = grouped.slice(parseInt(offset), parseInt(offset) + parseInt(limit));

      // Formatear respuesta y verificar agendamiento REAL en Google Calendar
      const formatted = await Promise.all(paginated.map(async (group) => {
        // Verificar si tiene evento REAL en Google Calendar
        let reallyScheduled = false;
        let calendarEventCount = 0;
        let calendarFormData = null; // NUEVO: Datos extraídos del calendario

        try {
          const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(group.phone);
          reallyScheduled = calendarCheck.hasScheduled;
          calendarEventCount = calendarCheck.eventCount;
          calendarFormData = calendarCheck.leadData || null; // NUEVO: Extraer datos del formulario

          // SINCRONIZACIÓN AUTOMÁTICA: Actualizar CRM con datos del calendario
          if (reallyScheduled && calendarFormData && group.leadData) {
            const needsUpdate =
              !group.leadData.email ||
              !group.leadData.website ||
              !group.leadData.lastName ||
              !group.leadData.calendarSyncedAt;

            if (needsUpdate) {
              logger.info('🔄 Sincronizando datos del calendario al CRM', { phone: group.phone });

              await prisma.leadData.update({
                where: { id: group.leadData.id },
                data: {
                  email: calendarFormData.email || group.leadData.email,
                  website: calendarFormData.sitioWeb || group.leadData.website,
                  lastName: calendarFormData.apellido || group.leadData.lastName,
                  name: calendarFormData.nombre || group.leadData.name,
                  calendarSyncedAt: new Date(),
                },
              });

              logger.info('✅ Datos sincronizados desde calendario', {
                phone: group.phone,
                syncedFields: {
                  email: !!calendarFormData.email,
                  website: !!calendarFormData.sitioWeb,
                  lastName: !!calendarFormData.apellido,
                  name: !!calendarFormData.nombre,
                },
              });

              // Actualizar el objeto group.leadData para reflejar los cambios
              group.leadData.email = calendarFormData.email || group.leadData.email;
              group.leadData.website = calendarFormData.sitioWeb || group.leadData.website;
              group.leadData.lastName = calendarFormData.apellido || group.leadData.lastName;
              group.leadData.name = calendarFormData.nombre || group.leadData.name;
              group.leadData.calendarSyncedAt = new Date();
            }
          }
        } catch (error) {
          logger.warn('Error verificando calendario para', group.phone, error.message);
        }

        return {
          phone: group.phone,
          conversationCount: group.conversations.length,
          conversationIds: group.conversations.map(c => c.id),
          status: group.conversations[0].status,
          outcome: group.conversations[0].outcome,
          leadTemperature: group.leadTemperature,
          leadScore: group.leadScore,
          scheduledMeeting: reallyScheduled, // Ahora es verificación REAL
          calendarEventCount: calendarEventCount, // Cantidad de eventos en calendario
          calendarFormData: calendarFormData, // NUEVO: Datos del formulario extraídos de Google Calendar
          startedAt: group.conversations[group.conversations.length - 1].startedAt,
          updatedAt: group.lastUpdate,
          lastMessage: group.lastMessage,
          leadData: group.leadData,
          messageCount: group.totalMessages,
          unreadCount: 0,
        };
      }));

      res.json({
        success: true,
        data: formatted,
        pagination: {
          total: grouped.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < grouped.length,
        },
      });

    } catch (error) {
      logger.error('Error obteniendo conversaciones:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo conversaciones',
      });
    }
  }

  /**
   * Obtener TODAS las conversaciones de un teléfono (historial completo)
   */
  async getConversationsByPhone(req, res) {
    try {
      const { phone } = req.params;

      // Obtener todas las conversaciones del teléfono
      const conversations = await prisma.conversation.findMany({
        where: { phone },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
          leadData: true,
          analytics: true,
        },
        orderBy: { startedAt: 'asc' }, // Ordenar cronológicamente
      });

      if (conversations.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No se encontraron conversaciones para este teléfono',
        });
      }

      // Combinar todos los mensajes en orden cronológico
      const allMessages = [];
      conversations.forEach(conv => {
        conv.messages.forEach(msg => {
          allMessages.push({
            ...msg,
            conversationId: conv.id,
            conversationStartedAt: conv.startedAt,
          });
        });
      });

      // Ordenar todos los mensajes por timestamp
      allMessages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // Obtener el leadData más reciente
      const latestLeadData = conversations
        .filter(c => c.leadData)
        .sort((a, b) => new Date(b.leadData.updatedAt) - new Date(a.leadData.updatedAt))[0]?.leadData;

      // Calcular estadísticas totales
      const totalMessages = allMessages.length;
      const totalConversations = conversations.length;
      const bestLeadScore = Math.max(...conversations.map(c => c.leadScore));
      const hasScheduledMeeting = conversations.some(c => c.scheduledMeeting);

      // NUEVO: Verificar calendario y extraer datos del formulario
      let calendarFormData = null;
      let calendarEventCount = 0;
      try {
        const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(phone);
        if (calendarCheck.hasScheduled) {
          calendarFormData = calendarCheck.leadData;
          calendarEventCount = calendarCheck.eventCount;

          // SINCRONIZACIÓN AUTOMÁTICA: Actualizar CRM con datos del calendario
          if (latestLeadData && calendarFormData) {
            const needsUpdate =
              !latestLeadData.email ||
              !latestLeadData.website ||
              !latestLeadData.lastName ||
              !latestLeadData.calendarSyncedAt;

            if (needsUpdate) {
              logger.info('🔄 Sincronizando datos del calendario al CRM', { phone });

              await prisma.leadData.update({
                where: { id: latestLeadData.id },
                data: {
                  email: calendarFormData.email || latestLeadData.email,
                  website: calendarFormData.sitioWeb || latestLeadData.website,
                  lastName: calendarFormData.apellido || latestLeadData.lastName,
                  name: calendarFormData.nombre || latestLeadData.name,
                  calendarSyncedAt: new Date(),
                },
              });

              logger.info('✅ Datos sincronizados desde calendario', {
                phone,
                syncedFields: {
                  email: !!calendarFormData.email,
                  website: !!calendarFormData.sitioWeb,
                  lastName: !!calendarFormData.apellido,
                  name: !!calendarFormData.nombre,
                },
              });
            }
          }
        }
      } catch (error) {
        logger.warn('Error verificando calendario para', phone, error.message);
      }

      res.json({
        success: true,
        data: {
          phone,
          conversations: conversations.map(c => ({
            id: c.id,
            startedAt: c.startedAt,
            endedAt: c.endedAt,
            status: c.status,
            outcome: c.outcome,
            messageCount: c.messages.length,
          })),
          messages: allMessages,
          leadData: latestLeadData,
          calendarFormData: calendarFormData, // NUEVO: Datos extraídos del calendario
          calendarEventCount: calendarEventCount, // NUEVO: Cantidad de eventos
          summary: {
            totalConversations,
            totalMessages,
            bestLeadScore,
            hasScheduledMeeting,
            firstContact: conversations[0].startedAt,
            lastActivity: conversations[conversations.length - 1].updatedAt,
          },
        },
      });

    } catch (error) {
      logger.error('Error obteniendo conversaciones por teléfono:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo conversaciones',
      });
    }
  }

  /**
   * Obtener una conversación específica con todos sus mensajes
   */
  async getConversationById(req, res) {
    try {
      const { id } = req.params;

      const conversation = await prisma.conversation.findUnique({
        where: { id },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
          leadData: true,
          analytics: true,
        },
      });

      if (!conversation) {
        return res.status(404).json({
          success: false,
          error: 'Conversación no encontrada',
        });
      }

      res.json({
        success: true,
        data: conversation,
      });

    } catch (error) {
      logger.error('Error obteniendo conversación:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo conversación',
      });
    }
  }

  /**
   * Obtener mensajes de una conversación (para cargar más mensajes)
   */
  async getMessages(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50, before } = req.query;

      const where = { conversationId: id };
      if (before) {
        where.timestamp = { lt: new Date(before) };
      }

      const messages = await prisma.message.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit),
      });

      res.json({
        success: true,
        data: messages.reverse(), // Ordenar ascendente para mostrar
      });

    } catch (error) {
      logger.error('Error obteniendo mensajes:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo mensajes',
      });
    }
  }

  /**
   * Etiquetar una conversación
   */
  async tagConversation(req, res) {
    try {
      const { id } = req.params;
      const { tags, notes } = req.body;

      // Por ahora actualizamos el outcome como "tag"
      // En el futuro puedes agregar una tabla Tags
      const conversation = await prisma.conversation.update({
        where: { id },
        data: {
          outcome: tags ? tags.join(',') : undefined,
          // Puedes agregar un campo 'notes' al schema si quieres
        },
      });

      res.json({
        success: true,
        data: conversation,
      });

    } catch (error) {
      logger.error('Error etiquetando conversación:', error);
      res.status(500).json({
        success: false,
        error: 'Error etiquetando conversación',
      });
    }
  }

  /**
   * Obtener estadísticas generales del dashboard
   */
  async getStats(req, res) {
    try {
      const [
        totalConversations,
        activeConversations,
        scheduledMeetings,
        hotLeads,
        warmLeads,
        coldLeads,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { status: 'active' } }),
        prisma.conversation.count({ where: { scheduledMeeting: true } }),
        prisma.conversation.count({ where: { leadTemperature: 'hot' } }),
        prisma.conversation.count({ where: { leadTemperature: 'warm' } }),
        prisma.conversation.count({ where: { leadTemperature: 'cold' } }),
      ]);

      // Conversiones últimos 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentConversions = await prisma.conversation.count({
        where: {
          scheduledMeeting: true,
          createdAt: { gte: sevenDaysAgo },
        },
      });

      const recentTotal = await prisma.conversation.count({
        where: {
          createdAt: { gte: sevenDaysAgo },
        },
      });

      const conversionRate = recentTotal > 0
        ? ((recentConversions / recentTotal) * 100).toFixed(1)
        : 0;

      res.json({
        success: true,
        data: {
          total: totalConversations,
          active: activeConversations,
          scheduled: scheduledMeetings,
          leads: {
            hot: hotLeads,
            warm: warmLeads,
            cold: coldLeads,
          },
          last7Days: {
            conversations: recentTotal,
            conversions: recentConversions,
            conversionRate: parseFloat(conversionRate),
          },
        },
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estadísticas',
      });
    }
  }

  /**
   * NUEVO: Obtener todos los leads (agrupados por teléfono) con filtros
   * Para la página de LEADS
   */
  async getLeads(req, res) {
    try {
      const {
        status,        // 'trial_14_days', 'paid_monthly_bonus', 'paid_after_trial', 'none'
        hasShopify,
        scheduled,
        limit = 100,
        offset = 0,
        sortBy = 'updatedAt',
        sortOrder = 'desc',
      } = req.query;

      // Construir filtros para leadData
      const leadWhere = {};
      if (status && status !== 'all') {
        leadWhere.conversionStatus = status;
      }
      if (hasShopify === 'true') {
        leadWhere.hasShopify = true;
      }

      // Obtener leads con sus conversaciones
      const leads = await prisma.leadData.findMany({
        where: leadWhere,
        include: {
          conversation: {
            include: {
              messages: {
                orderBy: { timestamp: 'desc' },
                take: 1,
              },
            },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: parseInt(offset),
        take: parseInt(limit),
      });

      // Filtrar por scheduled si se especifica
      let filteredLeads = leads;
      if (scheduled === 'true') {
        filteredLeads = leads.filter(lead => lead.conversation.scheduledMeeting);
      }

      // Enriquecer con datos del calendario
      const enrichedLeads = await Promise.all(filteredLeads.map(async (lead) => {
        let calendarData = null;
        let calendarEventCount = 0;

        try {
          const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(lead.conversation.phone);
          if (calendarCheck.hasScheduled) {
            calendarData = calendarCheck.leadData;
            calendarEventCount = calendarCheck.eventCount;
          }
        } catch (error) {
          logger.warn('Error verificando calendario', error);
        }

        return {
          id: lead.id,
          phone: lead.conversation.phone,
          name: lead.name,
          lastName: lead.lastName,
          email: lead.email,
          website: lead.website,
          businessType: lead.businessType,
          hasShopify: lead.hasShopify,
          monthlyRevenueCLP: lead.monthlyRevenueCLP,
          investsInAds: lead.investsInAds,
          conversionStatus: lead.conversionStatus,
          conversionDate: lead.conversionDate,
          conversionNotes: lead.conversionNotes,
          calendarSyncedAt: lead.calendarSyncedAt,
          scheduledMeeting: lead.conversation.scheduledMeeting,
          calendarEventCount,
          leadTemperature: lead.conversation.leadTemperature,
          leadScore: lead.conversation.leadScore,
          lastMessage: lead.conversation.messages[0],
          updatedAt: lead.updatedAt,
          createdAt: lead.extractedAt,
        };
      }));

      const total = await prisma.leadData.count({ where: leadWhere });

      res.json({
        success: true,
        data: enrichedLeads,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < total,
        },
      });

    } catch (error) {
      logger.error('Error obteniendo leads:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo leads',
      });
    }
  }

  /**
   * NUEVO: Actualizar estado de conversión de un lead
   */
  async updateLeadConversionStatus(req, res) {
    try {
      const { phone } = req.params;
      const { conversionStatus, conversionNotes } = req.body;

      // Validar estado
      const validStatuses = ['trial_14_days', 'paid_monthly_bonus', 'paid_after_trial', 'none'];
      if (!validStatuses.includes(conversionStatus)) {
        return res.status(400).json({
          success: false,
          error: `Estado inválido. Debe ser uno de: ${validStatuses.join(', ')}`,
        });
      }

      // Encontrar la conversación más reciente del teléfono
      const conversation = await prisma.conversation.findFirst({
        where: { phone },
        orderBy: { updatedAt: 'desc' },
        include: { leadData: true },
      });

      if (!conversation || !conversation.leadData) {
        return res.status(404).json({
          success: false,
          error: 'No se encontró lead para este teléfono',
        });
      }

      // Actualizar leadData
      const updatedLead = await prisma.leadData.update({
        where: { id: conversation.leadData.id },
        data: {
          conversionStatus,
          conversionDate: conversionStatus !== 'none' ? new Date() : null,
          conversionNotes,
        },
      });

      logger.info('✅ Estado de conversión actualizado', {
        phone,
        conversionStatus,
        leadId: updatedLead.id,
      });

      res.json({
        success: true,
        data: updatedLead,
      });

    } catch (error) {
      logger.error('Error actualizando estado de conversión:', error);
      res.status(500).json({
        success: false,
        error: 'Error actualizando estado de conversión',
      });
    }
  }

  /**
   * NUEVO: Obtener estadísticas de conversión
   */
  async getConversionStats(req, res) {
    try {
      const [
        totalLeads,
        trial14Days,
        paidMonthlyBonus,
        paidAfterTrial,
        withShopify,
        scheduled,
      ] = await Promise.all([
        prisma.leadData.count(),
        prisma.leadData.count({ where: { conversionStatus: 'trial_14_days' } }),
        prisma.leadData.count({ where: { conversionStatus: 'paid_monthly_bonus' } }),
        prisma.leadData.count({ where: { conversionStatus: 'paid_after_trial' } }),
        prisma.leadData.count({ where: { hasShopify: true } }),
        prisma.conversation.count({ where: { scheduledMeeting: true } }),
      ]);

      const totalPaid = paidMonthlyBonus + paidAfterTrial;
      const conversionRate = totalLeads > 0 ? ((totalPaid / totalLeads) * 100).toFixed(1) : 0;
      const shopifyConversionRate = withShopify > 0 ? ((scheduled / withShopify) * 100).toFixed(1) : 0;

      res.json({
        success: true,
        data: {
          totalLeads,
          byStatus: {
            trial_14_days: trial14Days,
            paid_monthly_bonus: paidMonthlyBonus,
            paid_after_trial: paidAfterTrial,
            none: totalLeads - trial14Days - paidMonthlyBonus - paidAfterTrial,
          },
          metrics: {
            withShopify,
            scheduled,
            totalPaid,
            conversionRate: parseFloat(conversionRate),
            shopifyToScheduledRate: parseFloat(shopifyConversionRate),
          },
        },
      });

    } catch (error) {
      logger.error('Error obteniendo estadísticas de conversión:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estadísticas',
      });
    }
  }
}

module.exports = new DashboardController();
