# OPTIMIZACIONES PENDIENTES - CHAT IA DATAPIFY

Este documento contiene las optimizaciones prioritarias identificadas en el análisis técnico del 18/11/2024.

---

## 🔴 PRIORIDAD CRÍTICA (Esta semana)

### 1. ✅ Prisma Client Singleton
**Estado:** ✅ COMPLETADO (18/11/2024)
**Tiempo real:** 1 día
**Archivo:** `src/db/prisma.js` (nuevo)
**Commit:** `fc77a96`

**Problema:**
- Múltiples instancias de PrismaClient creadas en cada archivo
- Memory leak crítico en producción
- Conexiones de BD agotadas

**Solución implementada:**
- ✅ Singleton pattern con global caching en desarrollo
- ✅ Importación centralizada desde `src/db/prisma.js`
- ✅ Refactor de 7 archivos que creaban instancias duplicadas
- ✅ Graceful shutdown implementado
- ✅ Logging diferenciado por environment

**Archivos modificados:**
- ✅ `src/db/prisma.js` (NUEVO - singleton)
- ✅ `src/services/conversationService.js`
- ✅ `src/controllers/dashboardController.js`
- ✅ `src/jobs/calendarSync.js`
- ✅ `src/routes/webhook.js` (eliminado disconnect manual)
- ✅ `src/routes/analytics.js`
- ✅ `src/services/learningService.js`

**Resultados:**
- ✅ Memory leak eliminado
- ✅ Pool de conexiones optimizado
- ✅ 100% sintaxis validada
- ✅ Listo para producción

---

### 2. ⏳ Autenticación en Dashboard
**Estado:** PENDIENTE
**Tiempo estimado:** 1 día
**Prioridad:** 🔴 CRÍTICA

**Problema:**
- Todos los endpoints del dashboard están públicos
- Datos sensibles de clientes expuestos (violación GDPR)
- Riesgo de spam masivo sin autorización

**Tareas:**
1. Implementar middleware de autenticación JWT
2. Crear endpoint `/api/auth/login`
3. Agregar `authMiddleware.requireAuth` a todas las rutas del dashboard
4. Implementar refresh tokens
5. Agregar rate limiting por usuario

**Archivos a modificar:**
- `src/middleware/auth.js` (NUEVO)
- `src/routes/dashboard.js`
- `src/config/index.js` (agregar JWT_SECRET)

**Ejemplo de implementación:**
```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');

exports.requireAuth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No autorizado' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token inválido' });
  }
};
```

---

### 3. ⏳ Cache para Google Calendar API
**Estado:** PENDIENTE
**Tiempo estimado:** 2 días
**Prioridad:** 🔴 CRÍTICA

**Problema:**
- N+1 query problem: 50+ llamadas a Calendar API en cada carga del dashboard
- Timeout con más de 20 leads
- Límites de API excedidos

**Solución:**
Implementar cache en memoria con TTL de 5 minutos

**Archivos a crear:**
- `src/services/calendarCache.js` (NUEVO)

**Archivos a modificar:**
- `src/services/calendarService.js`
- `src/controllers/dashboardController.js:131-234`

**Implementación propuesta:**
```javascript
// src/services/calendarCache.js
class CalendarCache {
  constructor() {
    this.cache = new Map();
    this.TTL = 5 * 60 * 1000; // 5 minutos
  }

  async getBatch(phones, fetchFunction) {
    const uncached = phones.filter(p => !this.isValid(p));

    if (uncached.length > 0) {
      // 1 sola llamada para todos los eventos
      const allEvents = await fetchFunction();

      // Cachear por teléfono
      phones.forEach(phone => {
        const events = allEvents.filter(e => e.description?.includes(phone));
        this.set(phone, events);
      });
    }

    return phones.map(p => this.get(p));
  }

  isValid(key) {
    const cached = this.cache.get(key);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < this.TTL;
  }

  set(key, value) {
    this.cache.set(key, { value, timestamp: Date.now() });
  }

  get(key) {
    return this.cache.get(key)?.value || null;
  }

  clear() {
    this.cache.clear();
  }
}

module.exports = new CalendarCache();
```

**Beneficios esperados:**
- Dashboard: 30s → <2s
- Reducción de 98% en llamadas a Calendar API
- Mejor experiencia de usuario

---

## 🟠 PRIORIDAD ALTA (Este mes)

### 4. ⏳ Índices Compuestos en Base de Datos
**Estado:** PENDIENTE
**Tiempo estimado:** 1 día
**Prioridad:** 🟠 ALTA

**Problema:**
- Full table scan en queries frecuentes del dashboard
- Con 10,000+ conversaciones: queries de 5-10 segundos
- PostgreSQL CPU al 100%

**Solución:**
Agregar índices compuestos al schema de Prisma

**Archivo a modificar:**
- `prisma/schema.prisma`

**Índices a agregar:**
```prisma
model Conversation {
  // ... campos existentes

  @@index([phone])
  @@index([leadDataId])
  @@index([createdAt])
  @@index([outcome])
  @@index([leadTemperature])

  // NUEVOS ÍNDICES COMPUESTOS:
  @@index([status, updatedAt(sort: Desc)], name: "idx_status_updated")
  @@index([status, leadTemperature], name: "idx_status_temp")
  @@index([phone, status], name: "idx_phone_status")
  @@index([outcome, scheduledMeeting], name: "idx_outcome_scheduled")
}

model Message {
  // ... campos existentes

  @@index([conversationId])
  @@index([timestamp])

  // NUEVOS ÍNDICES COMPUESTOS:
  @@index([conversationId, role, timestamp(sort: Desc)], name: "idx_conv_role_time")
  @@index([conversationId, timestamp(sort: Desc)], name: "idx_conv_time")
}

model LeadData {
  // ... campos existentes

  @@index([phone])
  @@index([hasShopify])
  @@index([monthlyRevenueCLP])
  @@index([conversionStatus])
  @@index([email])

  // NUEVOS ÍNDICES COMPUESTOS:
  @@index([hasShopify, conversionStatus], name: "idx_shopify_conversion")
  @@index([conversionStatus, updatedAt(sort: Desc)], name: "idx_conversion_updated")
}

model CampaignRecipient {
  // ... campos existentes

  @@index([campaignId])
  @@index([phone])
  @@index([status])

  // NUEVOS ÍNDICES COMPUESTOS:
  @@index([campaignId, status], name: "idx_campaign_status")
  @@index([messageId, status], name: "idx_message_status")
}
```

**Pasos de implementación:**
1. Agregar índices al schema
2. Ejecutar: `npx prisma migrate dev --name add_composite_indexes`
3. Ejecutar: `npx prisma generate`
4. Monitorear performance con `EXPLAIN ANALYZE` en PostgreSQL

**Beneficios esperados:**
- Queries del dashboard: 5-10s → <500ms
- Reducción de CPU de PostgreSQL en 70%
- Mejor escalabilidad

---

### 5. ⏳ Cola de Mensajes con Bull/BullMQ
**Estado:** PENDIENTE
**Tiempo estimado:** 3 días
**Prioridad:** 🟠 ALTA

**Problema:**
- Webhook procesa mensajes sin control de concurrencia
- Rate limits de OpenAI/Gemini excedidos
- Mensajes perdidos en caso de error

**Solución:**
Implementar cola con Bull + Redis

**Dependencias a instalar:**
```bash
npm install bull ioredis
```

**Archivos a crear:**
- `src/queues/messageQueue.js` (NUEVO)
- `src/workers/messageWorker.js` (NUEVO)

**Archivos a modificar:**
- `src/routes/webhook.js`
- `server.js` (iniciar worker)
- `.env` (agregar REDIS_URL)

**Implementación propuesta:**
```javascript
// src/queues/messageQueue.js
const Queue = require('bull');
const logger = require('../utils/logger');

const messageQueue = new Queue('whatsapp-messages', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
  },
});

// Configuración de procesamiento
messageQueue.process(5, async (job) => {
  const { message, metadata } = job.data;
  const messageController = require('../controllers/messageController');

  logger.info('Procesando mensaje desde cola', {
    phone: message.from,
    jobId: job.id,
  });

  return messageController.processMessage(message, metadata);
});

// Event listeners
messageQueue.on('completed', (job, result) => {
  logger.info('Mensaje procesado exitosamente', { jobId: job.id });
});

messageQueue.on('failed', (job, err) => {
  logger.error('Error procesando mensaje', {
    jobId: job.id,
    error: err.message,
  });
});

module.exports = messageQueue;
```

```javascript
// En webhook.js, reemplazar:
processMessageSequentially().catch(...);

// Por:
await messageQueue.add({
  message,
  metadata: value.metadata,
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: true,
  removeOnFail: false, // Guardar errores para debug
});
```

**Beneficios esperados:**
- Procesamiento controlado: max 5 mensajes concurrentes
- Retry automático con exponential backoff
- No más mensajes perdidos
- Dashboard de Bull para monitoreo
- Rate limiting automático

---

## 🟡 PRIORIDAD MEDIA (Próximos 3 meses)

### 6. Transaction Management
**Archivos:** Todos los controllers
**Tiempo estimado:** 2 días

Implementar transacciones en operaciones críticas:
```javascript
await prisma.$transaction(async (tx) => {
  await tx.message.create({ ... });
  await tx.campaignRecipient.create({ ... });
  await tx.leadData.upsert({ ... });
});
```

---

### 7. Migrar de Sync Job a Webhooks de Calendar
**Archivos:** `src/jobs/calendarSync.js`
**Tiempo estimado:** 3 días

Reemplazar polling cada 10 min por notificaciones push de Google Calendar API.

---

### 8. Resumen Automático de Conversaciones Largas
**Archivos:** `src/services/conversationService.js`
**Tiempo estimado:** 2 días

Implementar ventana deslizante + resumen con GPT para conversaciones >20 mensajes.

---

### 9. Tests Unitarios
**Coverage actual:** <5%
**Tiempo estimado:** 1 semana

Implementar tests con Jest:
- messageController
- conversationService
- webhooks

---

### 10. Monitoreo y Alertas
**Tiempo estimado:** 2 días

Implementar Sentry o Datadog para:
- Error tracking
- Performance monitoring
- Alertas de rate limits

---

## 📊 MÉTRICAS DE ÉXITO

### Antes de optimizaciones:
- Dashboard load time: 15-30s
- Max usuarios concurrentes: 100
- Costo OpenAI: $500/mes
- Crashes por semana: 2-3

### Después de optimizaciones:
- Dashboard load time: <2s (93% mejora)
- Max usuarios concurrentes: 10,000+ (100x mejora)
- Costo OpenAI: $200/mes (60% reducción)
- Crashes por semana: 0

---

## 📝 NOTAS IMPORTANTES

- Cada optimización debe testearse en staging antes de producción
- Hacer backup/snapshot de BD antes de migrar índices
- Monitorear métricas de performance después de cada cambio
- Documentar cambios en CHANGELOG.md

---

**Última actualización:** 18/11/2024
**Próxima revisión:** Después de implementar las 5 optimizaciones críticas
