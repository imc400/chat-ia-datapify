const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// GET /api/dashboard/conversations - Obtener todas las conversaciones (agrupadas por teléfono)
router.get('/conversations', dashboardController.getConversations);

// GET /api/dashboard/phone/:phone - Obtener todas las conversaciones de un teléfono (historial completo)
router.get('/phone/:phone', dashboardController.getConversationsByPhone);

// GET /api/dashboard/conversations/:id - Obtener una conversación específica con mensajes
router.get('/conversations/:id', dashboardController.getConversationById);

// GET /api/dashboard/conversations/:id/messages - Obtener mensajes de una conversación
router.get('/conversations/:id/messages', dashboardController.getMessages);

// PATCH /api/dashboard/conversations/:id/tag - Etiquetar conversación
router.patch('/conversations/:id/tag', dashboardController.tagConversation);

// GET /api/dashboard/stats - Estadísticas generales
router.get('/stats', dashboardController.getStats);

// GET /api/dashboard/conversion-stats - Estadísticas de conversión
router.get('/conversion-stats', dashboardController.getConversionStats);

// NUEVO: Gestión de Leads
// GET /api/dashboard/leads - Obtener todos los leads con filtros
router.get('/leads', dashboardController.getLeads);

// PATCH /api/dashboard/leads/:phone/conversion - Actualizar estado de conversión de un lead
router.patch('/leads/:phone/conversion', dashboardController.updateLeadConversionStatus);

// POST /api/dashboard/phone/:phone/mark-read - Marcar conversación como leída
router.post('/phone/:phone/mark-read', dashboardController.markAsRead);

// NUEVO: Envío de mensajes desde el dashboard
// POST /api/dashboard/send-message - Enviar mensaje a uno o varios leads
router.post('/send-message', dashboardController.sendMessage);

// POST /api/dashboard/preview-recipients - Preview de destinatarios según filtros
router.post('/preview-recipients', dashboardController.previewRecipients);

// NUEVO: Gestión de Campañas
// GET /api/dashboard/campaigns - Obtener lista de campañas
router.get('/campaigns', dashboardController.getCampaigns);

// GET /api/dashboard/campaigns/:id - Obtener detalle de una campaña
router.get('/campaigns/:id', dashboardController.getCampaignDetail);

module.exports = router;
