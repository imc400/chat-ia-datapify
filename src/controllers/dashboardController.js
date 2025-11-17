const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');
const calendarService = require('../services/calendarService');

const prisma = new PrismaClient();

/**
 * Helper para convertir BigInt a String en objetos JSON
 * Prisma devuelve BigInt para campos tipo BigInt en la DB, pero JSON.stringify no los soporta
 */
function serializeBigInt(obj) {
  return JSON.parse(JSON.stringify(obj, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  ));
}

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
            unreadCount: 0, // NUEVO: Contador de mensajes no leídos
            lastReadAt: null, // NUEVO: Última vez que se leyó esta conversación
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

        // Tomar el lastReadAt más reciente entre todas las conversaciones del teléfono
        if (conv.lastReadAt && (!groupedByPhone[conv.phone].lastReadAt ||
            new Date(conv.lastReadAt) > new Date(groupedByPhone[conv.phone].lastReadAt))) {
          groupedByPhone[conv.phone].lastReadAt = conv.lastReadAt;
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

      // Calcular mensajes no leídos para cada grupo
      for (const group of Object.values(groupedByPhone)) {
        // Contar mensajes del usuario que llegaron después de lastReadAt
        const unreadCount = await prisma.message.count({
          where: {
            conversationId: {
              in: group.conversations.map(c => c.id),
            },
            role: 'user', // Solo mensajes del usuario, no del asistente
            timestamp: group.lastReadAt ? {
              gt: group.lastReadAt, // Mensajes posteriores a la última lectura
            } : undefined, // Si nunca se ha leído, contar todos
          },
        });

        group.unreadCount = unreadCount;
      }

      // Convertir a array y ordenar por timestamp del último mensaje (no por updatedAt)
      // Esto evita que los chats se reordenen al marcarlos como leídos
      const grouped = Object.values(groupedByPhone)
        .sort((a, b) => {
          const aTime = a.lastMessage?.timestamp || a.lastUpdate;
          const bTime = b.lastMessage?.timestamp || b.lastUpdate;
          return new Date(bTime) - new Date(aTime);
        });

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
            const hasNewData =
              (calendarFormData.email && calendarFormData.email !== group.leadData.email) ||
              (calendarFormData.sitioWeb && calendarFormData.sitioWeb !== group.leadData.website) ||
              (calendarFormData.apellido && calendarFormData.apellido !== group.leadData.lastName) ||
              (calendarFormData.nombre && calendarFormData.nombre !== group.leadData.name) ||
              !group.leadData.calendarSyncedAt;

            if (hasNewData) {
              logger.info('🔄 Sincronizando datos del calendario al CRM', { phone: group.phone });

              await prisma.leadData.update({
                where: { phone: group.phone }, // ⭐ NUEVO: Actualizar por teléfono
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

            // ⭐ NUEVO: Actualizar scheduledMeeting en las conversaciones si aún no está marcado
            const conversationsToUpdate = group.conversations.filter(c => !c.scheduledMeeting);
            if (conversationsToUpdate.length > 0) {
              logger.info('📅 Actualizando scheduledMeeting en conversaciones', {
                phone: group.phone,
                conversationsCount: conversationsToUpdate.length,
              });

              // Actualizar todas las conversaciones del grupo
              await prisma.conversation.updateMany({
                where: {
                  id: { in: conversationsToUpdate.map(c => c.id) },
                },
                data: {
                  scheduledMeeting: true,
                  outcome: 'scheduled', // Cambiar outcome si aún está pending
                },
              });

              // Actualizar el objeto en memoria para reflejar los cambios
              group.conversations.forEach(c => {
                c.scheduledMeeting = true;
                if (c.outcome === 'pending') {
                  c.outcome = 'scheduled';
                }
              });
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
          unreadCount: group.unreadCount, // NUEVO: Contador real de mensajes no leídos
        };
      }));

      res.json(serializeBigInt({
        success: true,
        data: formatted,
        pagination: {
          total: grouped.length,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < grouped.length,
        },
      }));

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
                where: { phone }, // ⭐ NUEVO: Actualizar por teléfono
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

      res.json(serializeBigInt({ success: true, data: {
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
      }));

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

      res.json(serializeBigInt({ success: true, data: conversation,
      }));

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

      res.json(serializeBigInt({ success: true, data: messages.reverse(), // Ordenar ascendente para mostrar
      }));

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

      res.json(serializeBigInt({ success: true, data: conversation,
      }));

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
        pendingMeetings,
        disqualified,
        abandoned,
        hotLeads,
        warmLeads,
        coldLeads,
      ] = await Promise.all([
        prisma.conversation.count(),
        prisma.conversation.count({ where: { status: 'active' } }),
        prisma.conversation.count({ where: { outcome: 'scheduled' } }),
        prisma.conversation.count({ where: { outcome: 'pending' } }),
        prisma.conversation.count({ where: { outcome: 'disqualified' } }),
        prisma.conversation.count({ where: { outcome: 'abandoned' } }),
        prisma.conversation.count({ where: { leadTemperature: 'hot' } }),
        prisma.conversation.count({ where: { leadTemperature: 'warm' } }),
        prisma.conversation.count({ where: { leadTemperature: 'cold' } }),
      ]);

      // ⭐ NUEVO: Contar leads únicos (teléfonos únicos)
      const uniquePhones = await prisma.conversation.groupBy({
        by: ['phone'],
      });
      const uniqueLeads = uniquePhones.length;

      // Conversiones últimos 7 días
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const recentConversions = await prisma.conversation.count({
        where: {
          outcome: 'scheduled',
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

      // ⭐ NUEVO: Funnel de conversión completo
      const linksSent = pendingMeetings + scheduledMeetings; // Links enviados = pending + scheduled
      const funnelConversionRate = linksSent > 0
        ? ((scheduledMeetings / linksSent) * 100).toFixed(1)
        : 0;
      const overallConversionRate = totalConversations > 0
        ? ((scheduledMeetings / totalConversations) * 100).toFixed(1)
        : 0;
      const leadConversionRate = uniqueLeads > 0
        ? ((scheduledMeetings / uniqueLeads) * 100).toFixed(1)
        : 0;

      res.json(serializeBigInt({ success: true, data: {
          total: totalConversations,
          active: activeConversations,
          scheduled: scheduledMeetings,
          leads: {
            hot: hotLeads,
            warm: warmLeads,
            cold: coldLeads,
          },
          // ⭐ NUEVO: Funnel completo de conversión
          funnel: {
            // 1. Chats/Leads únicos (teléfonos únicos)
            uniqueLeads: uniqueLeads,
            // 2. Conversaciones totales iniciadas
            conversationsStarted: totalConversations,
            // 3. Links de agendamiento enviados
            linksSent: linksSent, // pending + scheduled
            // 4. Agendamientos confirmados
            scheduled: scheduledMeetings,
            // 5. Descalificados y abandonados
            disqualified: disqualified,
            abandoned: abandoned,
            pending: pendingMeetings, // Links enviados esperando confirmación
            // Tasas de conversión en cada etapa
            linkConversionRate: parseFloat(funnelConversionRate), // De links a agendados
            leadConversionRate: parseFloat(leadConversionRate), // De leads únicos a agendados
            overallConversionRate: parseFloat(overallConversionRate), // De conversaciones a agendados
          },
          last7Days: {
            conversations: recentTotal,
            conversions: recentConversions,
            conversionRate: parseFloat(conversionRate),
          },
        },
      }));

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
        scheduledMeeting,  // 'true' or 'false'
        responseStatus,    // 'no-response' or 'active'
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

      // Obtener leads con sus conversaciones (⭐ NUEVO: conversations es plural ahora)
      const leads = await prisma.leadData.findMany({
        where: leadWhere,
        include: {
          conversations: {
            include: {
              messages: {
                orderBy: { timestamp: 'desc' },
                take: 1,
              },
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
        orderBy: { [sortBy]: sortOrder },
        skip: parseInt(offset),
        take: parseInt(limit),
      });

      // Filtrar por scheduled si se especifica (legacy parameter)
      let filteredLeads = leads;
      if (scheduled === 'true') {
        filteredLeads = leads.filter(lead =>
          lead.conversations.some(conv => conv.scheduledMeeting)
        );
      }

      // Filtrar por scheduledMeeting (nuevo parámetro)
      if (scheduledMeeting === 'true') {
        filteredLeads = filteredLeads.filter(lead =>
          lead.conversations.some(conv => conv.scheduledMeeting)
        );
      } else if (scheduledMeeting === 'false') {
        filteredLeads = filteredLeads.filter(lead =>
          !lead.conversations.some(conv => conv.scheduledMeeting)
        );
      }

      // Enriquecer con datos del calendario
      const enrichedLeads = await Promise.all(filteredLeads.map(async (lead) => {
        let calendarData = null;
        let calendarEventCount = 0;

        try {
          const calendarCheck = await calendarService.checkPhoneHasScheduledEvents(lead.phone);
          if (calendarCheck.hasScheduled) {
            calendarData = calendarCheck.leadData;
            calendarEventCount = calendarCheck.eventCount;

            // SINCRONIZACIÓN AUTOMÁTICA: Actualizar LeadData si el calendario tiene datos nuevos
            const hasNewData =
              (calendarData.email && calendarData.email !== lead.email) ||
              (calendarData.sitioWeb && calendarData.sitioWeb !== lead.website) ||
              (calendarData.apellido && calendarData.apellido !== lead.lastName) ||
              (calendarData.nombre && calendarData.nombre !== lead.name) ||
              !lead.calendarSyncedAt;

            if (hasNewData) {
              await prisma.leadData.update({
                where: { phone: lead.phone },
                data: {
                  email: calendarData.email || lead.email,
                  website: calendarData.sitioWeb || lead.website,
                  lastName: calendarData.apellido || lead.lastName,
                  name: calendarData.nombre || lead.name,
                  calendarSyncedAt: new Date(),
                },
              });

              // Actualizar el objeto lead en memoria
              lead.email = calendarData.email || lead.email;
              lead.website = calendarData.sitioWeb || lead.website;
              lead.lastName = calendarData.apellido || lead.lastName;
              lead.name = calendarData.nombre || lead.name;
              lead.calendarSyncedAt = new Date();
            }

            // Actualizar scheduledMeeting en conversaciones si aún no está marcado
            const conversationsToUpdate = lead.conversations.filter(c => !c.scheduledMeeting);
            if (conversationsToUpdate.length > 0) {
              await prisma.conversation.updateMany({
                where: {
                  id: { in: conversationsToUpdate.map(c => c.id) },
                },
                data: {
                  scheduledMeeting: true,
                  outcome: 'scheduled',
                },
              });

              // Actualizar objetos en memoria
              lead.conversations.forEach(c => {
                c.scheduledMeeting = true;
                if (c.outcome === 'pending') {
                  c.outcome = 'scheduled';
                }
              });
            }
          }
        } catch (error) {
          logger.warn('Error verificando calendario', error);
        }

        // Tomar la conversación más reciente para métricas
        const latestConv = lead.conversations[0] || null;
        const hasScheduledMeeting = lead.conversations.some(c => c.scheduledMeeting);
        const bestLeadScore = Math.max(...lead.conversations.map(c => c.leadScore), 0);
        const bestTemperature = lead.conversations.reduce((best, c) => {
          const tempPriority = { hot: 3, warm: 2, cold: 1 };
          return (tempPriority[c.leadTemperature] || 0) > (tempPriority[best] || 0)
            ? c.leadTemperature
            : best;
        }, 'cold');

        // ⭐ FUENTE DE VERDAD: Google Calendar (no solo la DB)
        const reallyScheduled = calendarEventCount > 0 || hasScheduledMeeting;

        // Calcular días desde el último mensaje
        const lastMsg = latestConv?.messages[0] || null;
        let daysSinceLastMessage = null;
        if (lastMsg?.timestamp) {
          const now = new Date();
          const lastMsgDate = new Date(lastMsg.timestamp);
          const diffTime = Math.abs(now - lastMsgDate);
          daysSinceLastMessage = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        }

        return {
          id: lead.id,
          phone: lead.phone,
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
          scheduledMeeting: reallyScheduled, // ⭐ NUEVO: Usa calendario como fuente de verdad
          calendarEventCount,
          leadTemperature: bestTemperature,
          leadScore: bestLeadScore,
          outcome: latestConv?.outcome || null, // ⭐ NUEVO: Outcome de la conversación más reciente
          lastMessage: lastMsg,
          daysSinceLastMessage, // ⭐ NUEVO: Días desde el último mensaje
          conversationCount: lead.conversations.length,
          updatedAt: lead.updatedAt,
          createdAt: lead.extractedAt,
        };
      }));

      // Filtrar por responseStatus (después del enriquecimiento)
      let finalLeads = enrichedLeads;
      if (responseStatus === 'no-response') {
        // Leads sin respuesta: MISMA LÓGICA que los avatares grises
        // Son los leads "cold" que no mostraron interés o no respondieron
        // ⭐ CRITERIO: Coincide exactamente con getAvatarColor() -> 'avatar-default'
        finalLeads = enrichedLeads.filter(lead => {
          // Excluir si agendó (azul)
          if (lead.scheduledMeeting) return false;

          // Excluir si tiene Shopify (verde)
          if (lead.hasShopify) return false;

          // Excluir si es hot lead (rojo)
          if (lead.leadTemperature === 'hot') return false;

          // Excluir si es warm lead (naranja)
          if (lead.leadTemperature === 'warm') return false;

          // Lo que queda son los "cold" o sin temperatura -> avatar gris
          return true;
        });
      } else if (responseStatus === 'active') {
        // Leads activos: última mensaje es del usuario (están conversando activamente)
        finalLeads = enrichedLeads.filter(lead => {
          const lastMsg = lead.lastMessage;
          return lastMsg && lastMsg.role === 'user';
        });
      }

      const total = await prisma.leadData.count({ where: leadWhere });

      res.json(serializeBigInt({ success: true, data: finalLeads,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < total,
        },
      }));

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
      const validStatuses = ['trial_14_days', 'trial_completed_no_payment', 'paid_monthly_bonus', 'paid_after_trial', 'none'];
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
        where: { phone }, // ⭐ NUEVO: Actualizar por teléfono
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

      res.json(serializeBigInt({ success: true, data: updatedLead,
      }));

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
        trialCompletedNoPayment,
        paidMonthlyBonus,
        paidAfterTrial,
        withShopify,
        scheduled,
      ] = await Promise.all([
        prisma.leadData.count(),
        prisma.leadData.count({ where: { conversionStatus: 'trial_14_days' } }),
        prisma.leadData.count({ where: { conversionStatus: 'trial_completed_no_payment' } }),
        prisma.leadData.count({ where: { conversionStatus: 'paid_monthly_bonus' } }),
        prisma.leadData.count({ where: { conversionStatus: 'paid_after_trial' } }),
        prisma.leadData.count({ where: { hasShopify: true } }),
        prisma.conversation.count({ where: { scheduledMeeting: true } }),
      ]);

      const totalPaid = paidMonthlyBonus + paidAfterTrial;
      const conversionRate = totalLeads > 0 ? ((totalPaid / totalLeads) * 100).toFixed(1) : 0;
      const shopifyConversionRate = withShopify > 0 ? ((scheduled / withShopify) * 100).toFixed(1) : 0;

      res.json(serializeBigInt({ success: true, data: {
          totalLeads,
          byStatus: {
            trial_14_days: trial14Days,
            trial_completed_no_payment: trialCompletedNoPayment,
            paid_monthly_bonus: paidMonthlyBonus,
            paid_after_trial: paidAfterTrial,
            none: totalLeads - trial14Days - trialCompletedNoPayment - paidMonthlyBonus - paidAfterTrial,
          },
          metrics: {
            withShopify,
            scheduled,
            totalPaid,
            conversionRate: parseFloat(conversionRate),
            shopifyToScheduledRate: parseFloat(shopifyConversionRate),
          },
        },
      }));

    } catch (error) {
      logger.error('Error obteniendo estadísticas de conversión:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo estadísticas',
      });
    }
  }

  /**
   * Marcar conversación como leída
   * Actualiza lastReadAt para todas las conversaciones de un teléfono
   * IMPORTANTE: Usa raw query para NO actualizar updatedAt automáticamente
   */
  async markAsRead(req, res) {
    try {
      const { phone } = req.params;

      if (!phone) {
        return res.status(400).json({
          success: false,
          error: 'Teléfono requerido',
        });
      }

      // Usar $executeRaw para actualizar SOLO lastReadAt sin tocar updatedAt
      // Esto evita que los chats se reordenen al hacer click
      const updated = await prisma.$executeRaw`
        UPDATE "Conversation"
        SET "lastReadAt" = ${new Date()}
        WHERE phone = ${phone}
      `;

      logger.info(`📖 Conversaciones marcadas como leídas para ${phone}`, {
        count: updated,
      });

      res.json({
        success: true,
        data: {
          phone,
          conversationsUpdated: updated,
          markedAt: new Date(),
        },
      });

    } catch (error) {
      logger.error('Error marcando conversación como leída:', error);
      res.status(500).json({
        success: false,
        error: 'Error marcando como leída',
      });
    }
  }

  /**
   * NUEVO: Preview de destinatarios según filtros
   * Muestra lista de números que recibirían el mensaje según los filtros aplicados
   */
  async previewRecipients(req, res) {
    try {
      const {
        hasShopify,
        scheduled,
        conversionStatus,
        leadTemperature,
        minLeadScore,
      } = req.body;

      // Construir filtros para leadData
      const leadWhere = {};

      // Filtro de Shopify: manejar true, false, y undefined (todos)
      if (hasShopify === true) {
        leadWhere.hasShopify = true;
      } else if (hasShopify === false) {
        // CRÍTICO: Filtrar explícitamente por false O null
        leadWhere.OR = [
          { hasShopify: false },
          { hasShopify: null },
        ];
      }
      // Si hasShopify === undefined, no agregar filtro (mostrar todos)

      if (conversionStatus && conversionStatus !== 'all') {
        if (conversionStatus === 'none') {
          leadWhere.conversionStatus = null;
        } else {
          leadWhere.conversionStatus = conversionStatus;
        }
      }

      // Obtener leads que cumplen los criterios
      const leads = await prisma.leadData.findMany({
        where: leadWhere,
        include: {
          conversations: {
            include: {
              messages: {
                orderBy: { timestamp: 'desc' },
                take: 1,
              },
            },
            orderBy: { updatedAt: 'desc' },
          },
        },
      });

      // Filtrar por criterios adicionales
      let filteredLeads = leads;

      // Filtrar por scheduled
      if (scheduled === true) {
        filteredLeads = filteredLeads.filter(lead =>
          lead.conversations.some(conv => conv.scheduledMeeting)
        );
      } else if (scheduled === false) {
        filteredLeads = filteredLeads.filter(lead =>
          !lead.conversations.some(conv => conv.scheduledMeeting)
        );
      }

      // Filtrar por temperatura
      if (leadTemperature && leadTemperature !== 'all') {
        filteredLeads = filteredLeads.filter(lead => {
          const bestTemp = lead.conversations.reduce((best, c) => {
            const tempPriority = { hot: 3, warm: 2, cold: 1 };
            return (tempPriority[c.leadTemperature] || 0) > (tempPriority[best] || 0)
              ? c.leadTemperature
              : best;
          }, 'cold');
          return bestTemp === leadTemperature;
        });
      }

      // Filtrar por lead score mínimo
      if (minLeadScore && minLeadScore > 0) {
        filteredLeads = filteredLeads.filter(lead => {
          const bestScore = Math.max(...lead.conversations.map(c => c.leadScore), 0);
          return bestScore >= minLeadScore;
        });
      }

      // Formatear respuesta con información útil
      const recipients = filteredLeads.map(lead => {
        const latestConv = lead.conversations[0];
        const bestScore = Math.max(...lead.conversations.map(c => c.leadScore), 0);
        const hasScheduled = lead.conversations.some(c => c.scheduledMeeting);

        return {
          phone: lead.phone,
          name: lead.name || 'Sin nombre',
          businessType: lead.businessType || 'No especificado',
          hasShopify: lead.hasShopify,
          leadScore: bestScore,
          scheduledMeeting: hasScheduled,
          conversionStatus: lead.conversionStatus,
          lastMessage: latestConv?.messages[0]?.content || 'Sin mensajes',
          lastActivity: latestConv?.updatedAt || lead.updatedAt,
        };
      });

      // Ordenar por última actividad (más reciente primero)
      recipients.sort((a, b) => new Date(b.lastActivity) - new Date(a.lastActivity));

      logger.info('👁️ Preview de destinatarios generado', {
        totalRecipients: recipients.length,
        filters: { hasShopify, scheduled, conversionStatus, leadTemperature, minLeadScore },
      });

      res.json(serializeBigInt({
        success: true,
        data: {
          recipients,
          count: recipients.length,
          filters: {
            hasShopify,
            scheduled,
            conversionStatus,
            leadTemperature,
            minLeadScore,
          },
        },
      }));

    } catch (error) {
      logger.error('Error generando preview de destinatarios:', error);
      res.status(500).json({
        success: false,
        error: 'Error generando preview',
      });
    }
  }

  /**
   * NUEVO: Enviar mensaje a uno o varios leads desde el dashboard
   * Guarda el mensaje en BD para que la IA tenga contexto cuando respondan
   * AHORA CON TRACKING DE CAMPAÑAS
   */
  async sendMessage(req, res) {
    try {
      const { phones, message, source = 'manual_dashboard', campaignName, filters } = req.body;

      // Validaciones
      if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Debe proporcionar al menos un número de teléfono',
        });
      }

      if (!message || message.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'El mensaje no puede estar vacío',
        });
      }

      if (message.length > 1000) {
        return res.status(400).json({
          success: false,
          error: 'El mensaje no puede exceder 1000 caracteres',
        });
      }

      logger.info('📤 Iniciando envío masivo de mensajes', {
        recipientCount: phones.length,
        messageLength: message.length,
        source,
        campaignName: campaignName || 'Sin nombre',
      });

      // PASO 1: Crear campaña en la base de datos
      const campaign = await prisma.campaign.create({
        data: {
          name: campaignName || `Campaña ${new Date().toLocaleString('es-CL')}`,
          message: message,
          filters: filters || null,
          totalRecipients: phones.length,
          status: 'sending',
        },
      });

      logger.info('📋 Campaña creada', {
        campaignId: campaign.id,
        name: campaign.name,
      });

      // PASO 2: Obtener datos de los leads para los recipients
      const leadsData = await prisma.leadData.findMany({
        where: {
          phone: { in: phones },
        },
        select: {
          phone: true,
          name: true,
        },
      });

      // Crear map de phone -> name
      const phoneToNameMap = {};
      leadsData.forEach(lead => {
        phoneToNameMap[lead.phone] = lead.name;
      });

      const results = {
        sent: [],
        failed: [],
        total: phones.length,
      };

      // Importar servicios necesarios
      const whatsappService = require('../services/whatsappService');
      const conversationService = require('../services/conversationService');

      // PASO 3: Enviar mensajes con rate limiting (1 mensaje por segundo para no saturar WhatsApp API)
      for (let i = 0; i < phones.length; i++) {
        const phone = phones[i];
        const leadName = phoneToNameMap[phone] || null;

        try {
          // 1. Enviar mensaje por WhatsApp
          const whatsappResponse = await whatsappService.sendTextMessage(phone, message);
          const messageId = whatsappResponse?.messages?.[0]?.id || null;

          // 2. Obtener o crear conversación para este teléfono
          const conversation = await conversationService.getOrCreateConversation(phone);

          // 3. Guardar mensaje en BD como 'assistant' para que la IA lo vea en el historial
          await conversationService.saveMessage(
            conversation.id,
            'assistant',
            message,
            null,
            null
          );

          // 4. Guardar mensaje del sistema para tracking
          await conversationService.saveMessage(
            conversation.id,
            'system',
            `📤 Mensaje manual enviado desde dashboard - Campaña: ${campaign.name}`,
            null,
            0
          );

          // 5. Crear recipient en la campaña
          await prisma.campaignRecipient.create({
            data: {
              campaignId: campaign.id,
              phone: phone,
              leadName: leadName,
              status: 'sent',
              sentAt: new Date(),
              messageId: messageId,
            },
          });

          results.sent.push({
            phone,
            status: 'success',
            timestamp: new Date(),
          });

          logger.info('✅ Mensaje enviado correctamente', { phone, index: i + 1, total: phones.length });

          // Rate limiting: esperar 1 segundo entre mensajes (excepto el último)
          if (i < phones.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }

        } catch (error) {
          logger.error('❌ Error enviando mensaje', { phone, error: error.message });

          // Crear recipient con estado failed
          await prisma.campaignRecipient.create({
            data: {
              campaignId: campaign.id,
              phone: phone,
              leadName: leadName,
              status: 'failed',
              errorMessage: error.message,
            },
          });

          results.failed.push({
            phone,
            status: 'failed',
            error: error.message,
            timestamp: new Date(),
          });
        }
      }

      // PASO 4: Actualizar estadísticas de la campaña
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: {
          sentCount: results.sent.length,
          failedCount: results.failed.length,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      // Log final
      logger.info('📊 Envío masivo completado', {
        campaignId: campaign.id,
        campaignName: campaign.name,
        total: results.total,
        sent: results.sent.length,
        failed: results.failed.length,
        successRate: `${((results.sent.length / results.total) * 100).toFixed(1)}%`,
      });

      res.json(serializeBigInt({
        success: true,
        data: {
          message: `Envío completado: ${results.sent.length} exitosos, ${results.failed.length} fallidos`,
          campaignId: campaign.id,
          campaignName: campaign.name,
          results,
          summary: {
            total: results.total,
            sent: results.sent.length,
            failed: results.failed.length,
            successRate: parseFloat(((results.sent.length / results.total) * 100).toFixed(1)),
          },
        },
      }));

    } catch (error) {
      logger.error('Error en envío masivo de mensajes:', error);
      res.status(500).json({
        success: false,
        error: 'Error enviando mensajes',
        details: error.message,
      });
    }
  }

  /**
   * NUEVO: Obtener lista de campañas con estadísticas
   */
  async getCampaigns(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.query;

      const campaigns = await prisma.campaign.findMany({
        orderBy: { createdAt: 'desc' },
        take: parseInt(limit),
        skip: parseInt(offset),
        select: {
          id: true,
          name: true,
          message: true,
          filters: true,
          totalRecipients: true,
          sentCount: true,
          failedCount: true,
          deliveredCount: true,
          readCount: true,
          repliedCount: true,
          status: true,
          createdAt: true,
          completedAt: true,
        },
      });

      const total = await prisma.campaign.count();

      logger.info('📋 Campañas obtenidas', {
        count: campaigns.length,
        total,
      });

      res.json(serializeBigInt({
        success: true,
        data: {
          campaigns,
          pagination: {
            total,
            limit: parseInt(limit),
            offset: parseInt(offset),
            hasMore: (parseInt(offset) + campaigns.length) < total,
          },
        },
      }));

    } catch (error) {
      logger.error('Error obteniendo campañas:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo campañas',
        details: error.message,
      });
    }
  }

  /**
   * NUEVO: Obtener detalle completo de una campaña con sus recipients
   */
  async getCampaignDetail(req, res) {
    try {
      const { id } = req.params;

      const campaign = await prisma.campaign.findUnique({
        where: { id },
        include: {
          recipients: {
            orderBy: { sentAt: 'desc' },
          },
        },
      });

      if (!campaign) {
        return res.status(404).json({
          success: false,
          error: 'Campaña no encontrada',
        });
      }

      logger.info('📊 Detalle de campaña obtenido', {
        campaignId: id,
        name: campaign.name,
        recipientCount: campaign.recipients.length,
      });

      res.json(serializeBigInt({
        success: true,
        data: campaign,
      }));

    } catch (error) {
      logger.error('Error obteniendo detalle de campaña:', error);
      res.status(500).json({
        success: false,
        error: 'Error obteniendo detalle de campaña',
        details: error.message,
      });
    }
  }
}

module.exports = new DashboardController();
