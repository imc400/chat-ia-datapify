const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

class DashboardController {
  /**
   * Obtener todas las conversaciones con información resumida
   */
  async getConversations(req, res) {
    try {
      const { status, temperature, limit = 50, offset = 0 } = req.query;

      const where = {};
      if (status) where.status = status;
      if (temperature) where.leadTemperature = temperature;

      const conversations = await prisma.conversation.findMany({
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
        take: parseInt(limit),
        skip: parseInt(offset),
      });

      // Contar total para paginación
      const total = await prisma.conversation.count({ where });

      // Formatear respuesta
      const formatted = conversations.map(conv => ({
        id: conv.id,
        phone: conv.phone,
        status: conv.status,
        outcome: conv.outcome,
        leadTemperature: conv.leadTemperature,
        leadScore: conv.leadScore,
        scheduledMeeting: conv.scheduledMeeting,
        startedAt: conv.startedAt,
        updatedAt: conv.updatedAt,
        lastMessage: conv.messages[0] || null,
        leadData: conv.leadData,
        messageCount: conv.analytics?.totalMessages || 0,
        unreadCount: 0, // Por ahora, después puedes agregar lógica de "leído"
      }));

      res.json({
        success: true,
        data: formatted,
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: offset + limit < total,
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
