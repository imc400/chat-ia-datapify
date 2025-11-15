const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// GET /api/dashboard/conversations - Obtener todas las conversaciones
router.get('/conversations', dashboardController.getConversations);

// GET /api/dashboard/conversations/:id - Obtener una conversación específica con mensajes
router.get('/conversations/:id', dashboardController.getConversationById);

// GET /api/dashboard/conversations/:id/messages - Obtener mensajes de una conversación
router.get('/conversations/:id/messages', dashboardController.getMessages);

// PATCH /api/dashboard/conversations/:id/tag - Etiquetar conversación
router.patch('/conversations/:id/tag', dashboardController.tagConversation);

// GET /api/dashboard/stats - Estadísticas generales
router.get('/stats', dashboardController.getStats);

module.exports = router;
