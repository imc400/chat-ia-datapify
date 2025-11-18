const express = require('express');
const prisma = require('../db/prisma');
const learningService = require('../services/learningService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/analytics/dashboard
 * Dashboard principal con todas las métricas
 */
router.get('/dashboard', async (req, res) => {
  try {
    // 1. Métricas generales
    const totalConversations = await prisma.conversation.count();
    const activeConversations = await prisma.conversation.count({
      where: { status: 'active' },
    });
    const completedConversations = await prisma.conversation.count({
      where: { status: 'completed' },
    });
    const scheduledMeetings = await prisma.conversation.count({
      where: { scheduledMeeting: true },
    });

    // 2. Tasa de conversión
    const conversionRate = completedConversations > 0
      ? ((scheduledMeetings / completedConversations) * 100).toFixed(2)
      : 0;

    // 3. Distribución por temperatura
    const temperatures = await prisma.conversation.groupBy({
      by: ['leadTemperature'],
      _count: true,
    });

    // 4. Conversiones por temperatura
    const conversionsByTemp = {};
    for (const temp of ['hot', 'warm', 'cold']) {
      const total = await prisma.conversation.count({
        where: { leadTemperature: temp },
      });
      const converted = await prisma.conversation.count({
        where: { leadTemperature: temp, scheduledMeeting: true },
      });
      conversionsByTemp[temp] = {
        total,
        converted,
        rate: total > 0 ? ((converted / total) * 100).toFixed(2) : 0,
      };
    }

    // 5. Promedio de mensajes antes de conversión
    const conversionsWithMessages = await prisma.conversation.findMany({
      where: { scheduledMeeting: true },
      include: { messages: true },
    });

    const avgMessagesBeforeConversion = conversionsWithMessages.length > 0
      ? (conversionsWithMessages.reduce((sum, conv) => sum + conv.messages.length, 0) / conversionsWithMessages.length).toFixed(1)
      : 0;

    // 6. Últimas 10 conversaciones
    const recentConversations = await prisma.conversation.findMany({
      take: 10,
      orderBy: { createdAt: 'desc' },
      include: {
        leadData: true,
        analytics: true,
      },
    });

    // 7. Insights de aprendizaje
    const insights = await learningService.getInsights(0.6);

    res.json({
      success: true,
      data: {
        overview: {
          totalConversations,
          activeConversations,
          completedConversations,
          scheduledMeetings,
          conversionRate: `${conversionRate}%`,
          avgMessagesBeforeConversion,
        },
        temperatures: temperatures.map(t => ({
          temperature: t.leadTemperature,
          count: t._count,
        })),
        conversionsByTemperature: conversionsByTemp,
        recentConversations: recentConversations.map(conv => ({
          id: conv.id,
          phone: conv.phone.substring(0, 8) + '***', // Ocultar parte del número
          temperature: conv.leadTemperature,
          score: conv.leadScore,
          scheduled: conv.scheduledMeeting,
          outcome: conv.outcome,
          leadName: conv.leadData?.name || 'Sin nombre',
          businessType: conv.leadData?.businessType || 'N/A',
          hasShopify: conv.leadData?.hasShopify || false,
          messagesCount: conv.analytics?.totalMessages || 0,
          createdAt: conv.createdAt,
        })),
        learningInsights: insights.map(insight => ({
          type: insight.insightType,
          pattern: insight.pattern,
          confidence: `${(insight.confidence * 100).toFixed(0)}%`,
          impact: insight.impactScore,
          applied: insight.appliedToPrompt,
        })),
      },
    });
  } catch (error) {
    logger.error('Error obteniendo dashboard:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo métricas',
    });
  }
});

/**
 * GET /api/analytics/conversation/:id
 * Detalle completo de una conversación
 */
router.get('/conversation/:id', async (req, res) => {
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
      data: {
        conversation: {
          id: conversation.id,
          phone: conversation.phone,
          status: conversation.status,
          outcome: conversation.outcome,
          temperature: conversation.leadTemperature,
          score: conversation.leadScore,
          scheduled: conversation.scheduledMeeting,
          startedAt: conversation.startedAt,
          endedAt: conversation.endedAt,
        },
        leadData: conversation.leadData,
        analytics: conversation.analytics,
        messages: conversation.messages.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
          responseTime: msg.responseTimeMs,
        })),
      },
    });
  } catch (error) {
    logger.error('Error obteniendo conversación:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo conversación',
    });
  }
});

/**
 * GET /api/analytics/insights
 * Todos los insights descubiertos por la IA
 */
router.get('/insights', async (req, res) => {
  try {
    const minConfidence = parseFloat(req.query.minConfidence) || 0.5;
    const insights = await learningService.getInsights(minConfidence);

    res.json({
      success: true,
      data: {
        insights: insights.map(insight => ({
          id: insight.id,
          type: insight.insightType,
          pattern: insight.pattern,
          confidence: insight.confidence,
          confidencePercent: `${(insight.confidence * 100).toFixed(0)}%`,
          impactScore: insight.impactScore,
          appliedToPrompt: insight.appliedToPrompt,
          sampleConversations: insight.sampleConversations,
          discoveredAt: insight.discoveredAt,
        })),
        count: insights.length,
      },
    });
  } catch (error) {
    logger.error('Error obteniendo insights:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo insights',
    });
  }
});

/**
 * POST /api/analytics/discover-insights
 * Ejecuta el descubrimiento de insights manualmente
 */
router.post('/discover-insights', async (req, res) => {
  try {
    await learningService.discoverInsights();

    const insights = await learningService.getInsights(0.5);

    res.json({
      success: true,
      message: 'Insights descubiertos exitosamente',
      data: {
        insightsDiscovered: insights.length,
        insights: insights.map(i => ({
          type: i.insightType,
          confidence: `${(i.confidence * 100).toFixed(0)}%`,
          impact: i.impactScore,
        })),
      },
    });
  } catch (error) {
    logger.error('Error descubriendo insights:', error);
    res.status(500).json({
      success: false,
      error: 'Error descubriendo insights',
    });
  }
});

/**
 * GET /api/analytics/prompt-suggestions
 * Sugerencias de la IA para mejorar el prompt
 */
router.get('/prompt-suggestions', async (req, res) => {
  try {
    const suggestions = await learningService.generatePromptSuggestions();

    res.json({
      success: true,
      data: {
        suggestions,
        count: suggestions.length,
      },
    });
  } catch (error) {
    logger.error('Error generando sugerencias:', error);
    res.status(500).json({
      success: false,
      error: 'Error generando sugerencias',
    });
  }
});

/**
 * GET /api/analytics/funnel
 * Análisis completo del funnel de conversión por etapas
 */
router.get('/funnel', async (req, res) => {
  try {
    // 1. ETAPA 1: Total de chats únicos (por teléfono) - contar conversations únicas por phone
    const uniquePhones = await prisma.conversation.groupBy({
      by: ['phone'],
    });
    const totalLeads = uniquePhones.length;

    // 2. ETAPA 2: Agendaron reunión (scheduledMeeting = true)
    // Contar PHONES únicos con al menos una conversación scheduled
    const scheduledConversations = await prisma.conversation.groupBy({
      by: ['phone'],
      where: {
        scheduledMeeting: true,
      },
    });
    const totalScheduled = scheduledConversations.length;

    // Obtener todos los leads para etapas de conversión (trial/pago)
    const allLeads = await prisma.leadData.findMany({
      include: {
        conversations: true,
      },
    });

    // 3. ETAPA 3A: Empezaron trial de 14 días (actualmente en trial)
    const leadsTrial = allLeads.filter(lead =>
      lead.conversionStatus === 'trial_14_days'
    );
    const totalTrial = leadsTrial.length;

    // 3B. ETAPA 3B: Pagaron plan mensual con bonos (directo, sin trial)
    const leadsPaidBonus = allLeads.filter(lead =>
      lead.conversionStatus === 'paid_monthly_bonus'
    );
    const totalPaidBonus = leadsPaidBonus.length;

    // 4. ETAPA 4: Pagaron después del trial (conversión exitosa)
    const leadsPaidAfterTrial = allLeads.filter(lead =>
      lead.conversionStatus === 'paid_after_trial'
    );
    const totalPaidAfterTrial = leadsPaidAfterTrial.length;

    // 5. ETAPA 5: Terminaron trial pero NO pagaron (churn)
    const leadsTrialNoPayment = allLeads.filter(lead =>
      lead.conversionStatus === 'trial_completed_no_payment'
    );
    const totalTrialNoPayment = leadsTrialNoPayment.length;

    // TOTALES
    const totalConverted = totalPaidBonus + totalPaidAfterTrial; // Total que pagó
    const totalStartedSomething = totalTrial + totalPaidBonus; // Total que empezó algo (trial O pago directo)
    const totalTrialCompleted = totalPaidAfterTrial + totalTrialNoPayment; // Total que terminó trial (pagó o no)

    // TASAS DE CONVERSIÓN
    const chatToScheduleRate = totalLeads > 0 ? (totalScheduled / totalLeads * 100).toFixed(2) : 0;
    const scheduleToConversionRate = totalScheduled > 0 ? (totalStartedSomething / totalScheduled * 100).toFixed(2) : 0;
    const trialToPaymentRate = totalTrialCompleted > 0 ? (totalPaidAfterTrial / totalTrialCompleted * 100).toFixed(2) : 0;
    const trialChurnRate = totalTrialCompleted > 0 ? (totalTrialNoPayment / totalTrialCompleted * 100).toFixed(2) : 0;
    const overallConversionRate = totalLeads > 0 ? (totalConverted / totalLeads * 100).toFixed(2) : 0;

    // REVENUE (asumiendo $199 USD por cliente)
    const revenuePerClient = 199;
    const totalRevenue = totalConverted * revenuePerClient;
    const projectedMonthlyRevenue = totalRevenue; // Si todos son mensuales

    res.json({
      success: true,
      data: {
        funnel: {
          stage1_chats: {
            label: '1. Chats Iniciados',
            count: totalLeads,
            percentage: '100%',
            description: 'Total de leads únicos que iniciaron conversación',
          },
          stage2_scheduled: {
            label: '2. Agendaron Reunión',
            count: totalScheduled,
            percentage: `${chatToScheduleRate}%`,
            description: 'Leads que agendaron una reunión',
            conversionFromPrevious: `${chatToScheduleRate}%`,
          },
          stage3_trial: {
            label: '3. Empezaron Trial (14 días)',
            count: totalTrial,
            percentage: `${(totalLeads > 0 ? (totalTrial / totalLeads * 100).toFixed(2) : 0)}%`,
            description: 'Leads en periodo de prueba de 14 días',
            conversionFromScheduled: totalScheduled > 0 ? `${(totalTrial / totalScheduled * 100).toFixed(2)}%` : '0%',
          },
          stage4_paid_bonus: {
            label: '4. Pagaron Directo (con bonos)',
            count: totalPaidBonus,
            percentage: `${(totalLeads > 0 ? (totalPaidBonus / totalLeads * 100).toFixed(2) : 0)}%`,
            description: 'Leads que pagaron $199/mes directo con bonos (sin trial)',
            conversionFromScheduled: totalScheduled > 0 ? `${(totalPaidBonus / totalScheduled * 100).toFixed(2)}%` : '0%',
          },
          stage5_paid_after_trial: {
            label: '5. Pagaron Post-Trial',
            count: totalPaidAfterTrial,
            percentage: `${(totalLeads > 0 ? (totalPaidAfterTrial / totalLeads * 100).toFixed(2) : 0)}%`,
            description: 'Leads que completaron trial y pagaron',
            conversionFromTrial: `${trialToPaymentRate}%`,
          },
          stage6_trial_churn: {
            label: '6. Trial Sin Conversión (Churn)',
            count: totalTrialNoPayment,
            percentage: `${(totalLeads > 0 ? (totalTrialNoPayment / totalLeads * 100).toFixed(2) : 0)}%`,
            description: 'Leads que terminaron trial pero NO pagaron',
            churnRate: `${trialChurnRate}%`,
          },
        },
        conversionRates: {
          chatToSchedule: {
            label: 'Chat → Agendamiento',
            rate: `${chatToScheduleRate}%`,
            description: `${totalScheduled} de ${totalLeads} chats agendaron`,
          },
          scheduleToConversion: {
            label: 'Agendamiento → Conversión (Trial o Pago)',
            rate: `${scheduleToConversionRate}%`,
            description: `${totalStartedSomething} de ${totalScheduled} agendados se convirtieron`,
          },
          trialToPayment: {
            label: 'Trial → Pago',
            rate: `${trialToPaymentRate}%`,
            description: `${totalPaidAfterTrial} de ${totalTrialCompleted} trials completados pagaron`,
          },
          trialChurn: {
            label: 'Trial → Churn',
            rate: `${trialChurnRate}%`,
            description: `${totalTrialNoPayment} de ${totalTrialCompleted} trials completados NO pagaron`,
          },
          overallConversion: {
            label: 'Conversión Total (Chat → Pago)',
            rate: `${overallConversionRate}%`,
            description: `${totalConverted} de ${totalLeads} chats terminaron pagando`,
          },
        },
        revenue: {
          totalPaying: totalConverted,
          revenuePerClient: `$${revenuePerClient} USD`,
          totalRevenue: `$${totalRevenue.toLocaleString()} USD`,
          projectedMonthlyRevenue: `$${projectedMonthlyRevenue.toLocaleString()} USD/mes`,
        },
        summary: {
          totalLeads,
          totalScheduled,
          totalTrial,
          totalPaidBonus,
          totalPaidAfterTrial,
          totalTrialNoPayment,
          totalConverted,
          totalStartedSomething,
          totalTrialCompleted,
        },
      },
    });
  } catch (error) {
    logger.error('Error obteniendo funnel:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo métricas del funnel',
    });
  }
});

/**
 * GET /api/analytics/leads
 * Listado de todos los leads con filtros
 */
router.get('/leads', async (req, res) => {
  try {
    const {
      temperature,
      hasShopify,
      scheduledMeeting,
      limit = 50,
      offset = 0,
    } = req.query;

    const where = {};
    if (temperature) where.leadTemperature = temperature;
    if (scheduledMeeting !== undefined) where.scheduledMeeting = scheduledMeeting === 'true';

    const leads = await prisma.conversation.findMany({
      where,
      include: {
        leadData: true,
        analytics: true,
      },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: parseInt(offset),
    });

    const total = await prisma.conversation.count({ where });

    res.json({
      success: true,
      data: {
        leads: leads.map(lead => ({
          id: lead.id,
          phone: lead.phone.substring(0, 8) + '***',
          name: lead.leadData?.name || 'Sin nombre',
          businessType: lead.leadData?.businessType || 'N/A',
          hasShopify: lead.leadData?.hasShopify,
          monthlyRevenue: lead.leadData?.monthlyRevenueCLP ? `$${(Number(lead.leadData.monthlyRevenueCLP) / 1000000).toFixed(1)}M` : 'N/A',
          investsInAds: lead.leadData?.investsInAds,
          temperature: lead.leadTemperature,
          score: lead.leadScore,
          scheduledMeeting: lead.scheduledMeeting,
          outcome: lead.outcome,
          messagesCount: lead.analytics?.totalMessages || 0,
          createdAt: lead.createdAt,
        })),
        pagination: {
          total,
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: (parseInt(offset) + parseInt(limit)) < total,
        },
      },
    });
  } catch (error) {
    logger.error('Error obteniendo leads:', error);
    res.status(500).json({
      success: false,
      error: 'Error obteniendo leads',
    });
  }
});

module.exports = router;
