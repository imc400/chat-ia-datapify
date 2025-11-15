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

module.exports = router;
