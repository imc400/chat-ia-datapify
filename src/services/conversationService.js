const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * ConversationService - Persiste TODA la información de conversaciones
 * Sistema de aprendizaje continuo para la IA
 */
class ConversationService {
  /**
   * Crea o recupera una conversación existente
   */
  async getOrCreateConversation(phone) {
    try {
      // Buscar conversación activa del usuario
      let conversation = await prisma.conversation.findFirst({
        where: {
          phone,
          status: 'active',
        },
        include: {
          messages: {
            orderBy: { timestamp: 'desc' },
            take: 8, // Últimos 8 mensajes para memoria
          },
          leadData: true,
          analytics: true,
        },
      });

      // Si no existe, crear nueva
      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            phone,
            status: 'active',
            leadTemperature: 'cold',
            leadScore: 0,
          },
          include: {
            messages: true,
            leadData: true,
            analytics: true,
          },
        });

        // Crear analytics inicial
        await prisma.conversationAnalytics.create({
          data: {
            conversationId: conversation.id,
          },
        });

        logger.info('🆕 Nueva conversación creada', { phone, conversationId: conversation.id });
      }

      return conversation;
    } catch (error) {
      logger.error('Error obteniendo/creando conversación:', error);
      throw error;
    }
  }

  /**
   * Guarda un mensaje en la base de datos
   */
  async saveMessage(conversationId, role, content, tokensUsed = null, responseTimeMs = null) {
    try {
      const message = await prisma.message.create({
        data: {
          conversationId,
          role,
          content,
          tokensUsed,
          responseTimeMs,
        },
      });

      // Actualizar analytics
      await this.updateAnalytics(conversationId, role, content);

      logger.info('💾 Mensaje guardado', {
        conversationId,
        role,
        messageLength: content.length,
      });

      return message;
    } catch (error) {
      logger.error('Error guardando mensaje:', error);
      throw error;
    }
  }

  /**
   * Actualiza analytics de la conversación en tiempo real
   */
  async updateAnalytics(conversationId, role, content) {
    try {
      const analytics = await prisma.conversationAnalytics.findUnique({
        where: { conversationId },
      });

      if (!analytics) {
        await prisma.conversationAnalytics.create({
          data: { conversationId },
        });
      }

      const updates = {
        totalMessages: { increment: 1 },
      };

      if (role === 'user') {
        updates.userMessages = { increment: 1 };
      } else if (role === 'assistant') {
        updates.assistantMessages = { increment: 1 };

        // Analizar mensaje del asistente
        const lowerContent = content.toLowerCase();

        // Contar uso del nombre (solo cuando el usuario ya lo proporcionó)
        const conversation = await prisma.conversation.findUnique({
          where: { id: conversationId },
          include: { leadData: true },
        });

        if (conversation?.leadData?.name) {
          const nameMatches = (content.match(new RegExp(conversation.leadData.name, 'gi')) || []).length;
          if (nameMatches > 0) {
            updates.nameUsedCount = { increment: nameMatches };
          }
        }

        // Contar palabras chilenas
        const chileanWords = ['tinca', 'cacho', 'bacán', 'palito', 'weon', 'po', 'demás', 'palos'];
        let chileanCount = 0;
        chileanWords.forEach(word => {
          const matches = (lowerContent.match(new RegExp(`\\b${word}\\b`, 'gi')) || []).length;
          chileanCount += matches;
        });
        if (chileanCount > 0) {
          updates.chileanWordsCount = { increment: chileanCount };
        }

        // Contar preguntas
        const questionMarks = (content.match(/\?/g) || []).length;
        if (questionMarks > 0) {
          updates.questionsAsked = { increment: questionMarks };
        }
      }

      await prisma.conversationAnalytics.update({
        where: { conversationId },
        data: updates,
      });
    } catch (error) {
      logger.error('Error actualizando analytics:', error);
      // No lanzar error para no interrumpir el flujo principal
    }
  }

  /**
   * Actualiza el lead score y temperatura
   */
  async updateLeadScore(conversationId, leadScore) {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          leadTemperature: leadScore.temperature,
          leadScore: leadScore.score,
        },
      });

      logger.info('🎯 Lead score actualizado', {
        conversationId,
        temperature: leadScore.temperature,
        score: leadScore.score,
      });
    } catch (error) {
      logger.error('Error actualizando lead score:', error);
    }
  }

  /**
   * Extrae y guarda datos del lead automáticamente
   * ⭐ NUEVO: Ahora basado en teléfono (no en conversationId)
   */
  async updateLeadData(conversationId, data) {
    try {
      // 1. Obtener el teléfono de la conversación
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { phone: true },
      });

      if (!conversation) {
        throw new Error(`Conversación ${conversationId} no encontrada`);
      }

      const phone = conversation.phone;

      // 2. Upsert el LeadData basado en el teléfono
      const leadData = await prisma.leadData.upsert({
        where: { phone },
        update: {
          ...data,
          updatedAt: new Date(),
        },
        create: {
          phone,
          ...data,
        },
      });

      // 3. Actualizar la conversación para apuntar al lead
      await prisma.conversation.update({
        where: { id: conversationId },
        data: { leadDataId: leadData.id },
      });

      logger.info('📊 Datos del lead actualizados', {
        phone,
        conversationId,
        hasShopify: data.hasShopify,
        monthlyRevenue: data.monthlyRevenueCLP,
      });

      return leadData;
    } catch (error) {
      logger.error('Error actualizando datos del lead:', error);
      throw error;
    }
  }

  /**
   * Marca conversación como completada con outcome
   */
  async completeConversation(conversationId, outcome, scheduledMeeting = false) {
    try {
      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: 'completed',
          outcome,
          scheduledMeeting,
          endedAt: new Date(),
        },
      });

      logger.info('✅ Conversación completada', {
        conversationId,
        outcome,
        scheduledMeeting,
      });
    } catch (error) {
      logger.error('Error completando conversación:', error);
    }
  }

  /**
   * Obtiene historial de mensajes para la IA
   */
  async getConversationHistory(conversationId, limit = 8) {
    try {
      const messages = await prisma.message.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        take: limit,
      });

      // Retornar en orden cronológico
      return messages.reverse().map(msg => ({
        role: msg.role === 'user' ? 'usuario' : 'asistente',
        content: msg.content,
      }));
    } catch (error) {
      logger.error('Error obteniendo historial:', error);
      return [];
    }
  }

  /**
   * Cierra conexión de Prisma (para testing)
   */
  async disconnect() {
    await prisma.$disconnect();
  }
}

module.exports = new ConversationService();
