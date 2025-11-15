const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

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

      // Formatear respuesta
      const formatted = paginated.map(group => ({
        phone: group.phone,
        conversationCount: group.conversations.length,
        conversationIds: group.conversations.map(c => c.id),
        status: group.conversations[0].status,
        outcome: group.conversations[0].outcome,
        leadTemperature: group.leadTemperature,
        leadScore: group.leadScore,
        scheduledMeeting: group.scheduledMeeting,
        startedAt: group.conversations[group.conversations.length - 1].startedAt, // Primera conversación
        updatedAt: group.lastUpdate,
        lastMessage: group.lastMessage,
        leadData: group.leadData,
        messageCount: group.totalMessages,
        unreadCount: 0,
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
}

module.exports = new DashboardController();
