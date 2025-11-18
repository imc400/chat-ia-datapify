const prisma = require('../db/prisma');
const logger = require('../utils/logger');

/**
 * LearningService - IA que APRENDE automáticamente
 * Analiza conversaciones y descubre patrones de éxito
 */
class LearningService {
  /**
   * Analiza TODAS las conversaciones y descubre insights
   * Este método debe ejecutarse periódicamente (cron job)
   */
  async discoverInsights() {
    try {
      logger.info('🧠 Iniciando descubrimiento de insights...');

      // 1. Analizar frases exitosas
      await this.findSuccessfulPhrases();

      // 2. Analizar timing óptimo
      await this.analyzeOptimalTiming();

      // 3. Analizar técnicas de rapport
      await this.analyzeRapportTechniques();

      // 4. Analizar conversiones por temperatura
      await this.analyzeConversionRates();

      logger.info('✅ Descubrimiento de insights completado');
    } catch (error) {
      logger.error('Error descubriendo insights:', error);
    }
  }

  /**
   * INSIGHT 1: Descubre frases que llevan a agendamiento
   */
  async findSuccessfulPhrases() {
    try {
      // Obtener conversaciones exitosas (con agendamiento)
      const successfulConversations = await prisma.conversation.findMany({
        where: {
          scheduledMeeting: true,
          outcome: 'scheduled',
        },
        include: {
          messages: {
            where: { role: 'assistant' },
            orderBy: { timestamp: 'asc' },
          },
        },
        take: 50, // Últimas 50 conversaciones exitosas
      });

      // Extraer frases comunes de los mensajes del asistente
      const phraseFrequency = {};

      successfulConversations.forEach(conv => {
        conv.messages.forEach(msg => {
          // Extraer frases (oraciones completas)
          const sentences = msg.content.split(/[.!?]/);
          sentences.forEach(sentence => {
            const clean = sentence.trim().toLowerCase();
            if (clean.length > 10 && clean.length < 100) {
              phraseFrequency[clean] = (phraseFrequency[clean] || 0) + 1;
            }
          });
        });
      });

      // Guardar las 5 frases más comunes como insights
      const sortedPhrases = Object.entries(phraseFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      for (const [phrase, frequency] of sortedPhrases) {
        const confidence = Math.min(frequency / successfulConversations.length, 1.0);

        // Solo guardar si tiene confianza > 0.3
        if (confidence > 0.3) {
          await prisma.learningInsight.upsert({
            where: {
              id: `successful_phrase_${Buffer.from(phrase).toString('base64').substring(0, 20)}`,
            },
            update: {
              confidence,
              sampleConversations: successfulConversations.slice(0, 5).map(c => c.id),
              impactScore: confidence * 10,
            },
            create: {
              insightType: 'successful_phrase',
              pattern: phrase,
              confidence,
              sampleConversations: successfulConversations.slice(0, 5).map(c => c.id),
              impactScore: confidence * 10,
            },
          });

          logger.info('💡 Insight: Frase exitosa descubierta', {
            phrase,
            frequency,
            confidence: confidence.toFixed(2),
          });
        }
      }
    } catch (error) {
      logger.error('Error encontrando frases exitosas:', error);
    }
  }

  /**
   * INSIGHT 2: Analiza el timing óptimo de preguntas
   */
  async analyzeOptimalTiming() {
    try {
      const successfulConversations = await prisma.conversation.findMany({
        where: {
          scheduledMeeting: true,
        },
        include: {
          messages: true,
          analytics: true,
        },
      });

      if (successfulConversations.length === 0) return;

      // Calcular promedios
      let totalMessages = 0;
      let totalQuestions = 0;

      successfulConversations.forEach(conv => {
        totalMessages += conv.messages.length;
        totalQuestions += conv.analytics?.questionsAsked || 0;
      });

      const avgMessagesBeforeConversion = totalMessages / successfulConversations.length;
      const avgQuestionsBeforeConversion = totalQuestions / successfulConversations.length;

      // Guardar insight
      await prisma.learningInsight.upsert({
        where: { id: 'optimal_timing_messages' },
        update: {
          pattern: `Conversiones exitosas ocurren en promedio después de ${avgMessagesBeforeConversion.toFixed(1)} mensajes con ${avgQuestionsBeforeConversion.toFixed(1)} preguntas`,
          confidence: 0.8,
          sampleConversations: successfulConversations.slice(0, 10).map(c => c.id),
          impactScore: 8.0,
        },
        create: {
          insightType: 'timing',
          pattern: `Conversiones exitosas ocurren en promedio después de ${avgMessagesBeforeConversion.toFixed(1)} mensajes con ${avgQuestionsBeforeConversion.toFixed(1)} preguntas`,
          confidence: 0.8,
          sampleConversations: successfulConversations.slice(0, 10).map(c => c.id),
          impactScore: 8.0,
        },
      });

      logger.info('⏱️  Insight: Timing óptimo descubierto', {
        avgMessages: avgMessagesBeforeConversion.toFixed(1),
        avgQuestions: avgQuestionsBeforeConversion.toFixed(1),
      });
    } catch (error) {
      logger.error('Error analizando timing:', error);
    }
  }

  /**
   * INSIGHT 3: Analiza técnicas de rapport efectivas
   */
  async analyzeRapportTechniques() {
    try {
      const successfulConversations = await prisma.conversation.findMany({
        where: {
          scheduledMeeting: true,
        },
        include: {
          analytics: true,
        },
      });

      if (successfulConversations.length === 0) return;

      // Calcular promedio de rapport moments en conversaciones exitosas
      let totalRapport = 0;
      let totalNameUsage = 0;
      let totalChileanWords = 0;

      successfulConversations.forEach(conv => {
        totalRapport += conv.analytics?.rapportMoments || 0;
        totalNameUsage += conv.analytics?.nameUsedCount || 0;
        totalChileanWords += conv.analytics?.chileanWordsCount || 0;
      });

      const avgRapport = totalRapport / successfulConversations.length;
      const avgNameUsage = totalNameUsage / successfulConversations.length;
      const avgChileanWords = totalChileanWords / successfulConversations.length;

      // Guardar insight
      await prisma.learningInsight.upsert({
        where: { id: 'rapport_technique' },
        update: {
          pattern: `Conversaciones exitosas usan el nombre ${avgNameUsage.toFixed(1)} veces, ${avgChileanWords.toFixed(1)} palabras chilenas, y ${avgRapport.toFixed(1)} momentos de rapport`,
          confidence: 0.75,
          sampleConversations: successfulConversations.slice(0, 10).map(c => c.id),
          impactScore: 7.5,
        },
        create: {
          insightType: 'rapport_technique',
          pattern: `Conversaciones exitosas usan el nombre ${avgNameUsage.toFixed(1)} veces, ${avgChileanWords.toFixed(1)} palabras chilenas, y ${avgRapport.toFixed(1)} momentos de rapport`,
          confidence: 0.75,
          sampleConversations: successfulConversations.slice(0, 10).map(c => c.id),
          impactScore: 7.5,
        },
      });

      logger.info('🤝 Insight: Técnicas de rapport descubiertas', {
        avgNameUsage: avgNameUsage.toFixed(1),
        avgChileanWords: avgChileanWords.toFixed(1),
        avgRapport: avgRapport.toFixed(1),
      });
    } catch (error) {
      logger.error('Error analizando rapport:', error);
    }
  }

  /**
   * INSIGHT 4: Analiza tasas de conversión por temperatura
   */
  async analyzeConversionRates() {
    try {
      const temperatures = ['hot', 'warm', 'cold'];
      const conversionRates = {};

      for (const temp of temperatures) {
        const total = await prisma.conversation.count({
          where: { leadTemperature: temp },
        });

        const converted = await prisma.conversation.count({
          where: {
            leadTemperature: temp,
            scheduledMeeting: true,
          },
        });

        conversionRates[temp] = total > 0 ? (converted / total) * 100 : 0;
      }

      // Guardar insight
      await prisma.learningInsight.upsert({
        where: { id: 'conversion_rates_by_temperature' },
        update: {
          pattern: `Tasas de conversión: Hot ${conversionRates.hot.toFixed(1)}%, Warm ${conversionRates.warm.toFixed(1)}%, Cold ${conversionRates.cold.toFixed(1)}%`,
          confidence: 0.9,
          sampleConversations: [],
          impactScore: 9.0,
        },
        create: {
          insightType: 'conversion_rate',
          pattern: `Tasas de conversión: Hot ${conversionRates.hot.toFixed(1)}%, Warm ${conversionRates.warm.toFixed(1)}%, Cold ${conversionRates.cold.toFixed(1)}%`,
          confidence: 0.9,
          sampleConversations: [],
          impactScore: 9.0,
        },
      });

      logger.info('📈 Insight: Tasas de conversión por temperatura', conversionRates);
    } catch (error) {
      logger.error('Error analizando conversión:', error);
    }
  }

  /**
   * Obtiene todos los insights descubiertos
   */
  async getInsights(minConfidence = 0.5) {
    try {
      const insights = await prisma.learningInsight.findMany({
        where: {
          confidence: { gte: minConfidence },
        },
        orderBy: {
          impactScore: 'desc',
        },
      });

      return insights;
    } catch (error) {
      logger.error('Error obteniendo insights:', error);
      return [];
    }
  }

  /**
   * Genera sugerencias para mejorar el prompt basado en insights
   */
  async generatePromptSuggestions() {
    try {
      const insights = await this.getInsights(0.6); // Insights con confianza > 60%

      const suggestions = [];

      insights.forEach(insight => {
        if (insight.insightType === 'successful_phrase' && !insight.appliedToPrompt) {
          suggestions.push({
            type: 'add_phrase',
            suggestion: `Considera agregar esta frase exitosa al prompt: "${insight.pattern}"`,
            confidence: insight.confidence,
            impact: insight.impactScore,
          });
        }

        if (insight.insightType === 'rapport_technique') {
          suggestions.push({
            type: 'adjust_rapport',
            suggestion: `Ajusta el uso del nombre y palabras chilenas según: ${insight.pattern}`,
            confidence: insight.confidence,
            impact: insight.impactScore,
          });
        }

        if (insight.insightType === 'timing') {
          suggestions.push({
            type: 'adjust_timing',
            suggestion: `Timing óptimo descubierto: ${insight.pattern}`,
            confidence: insight.confidence,
            impact: insight.impactScore,
          });
        }
      });

      return suggestions;
    } catch (error) {
      logger.error('Error generando sugerencias:', error);
      return [];
    }
  }

  /**
   * Cierra conexión de Prisma
   */
  async disconnect() {
    await prisma.$disconnect();
  }
}

module.exports = new LearningService();
