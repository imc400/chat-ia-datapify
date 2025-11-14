# Arquitectura del Sistema

Este documento explica la arquitectura técnica del bot de WhatsApp con IA y Google Calendar.

## Diagrama de Flujo General

```
┌─────────────┐
│   Usuario   │
│  WhatsApp   │
└──────┬──────┘
       │
       │ Mensaje
       ▼
┌──────────────────┐
│  WhatsApp Cloud  │
│       API        │
└──────┬───────────┘
       │
       │ Webhook POST
       ▼
┌──────────────────┐
│   Express.js     │
│   /webhook       │
└──────┬───────────┘
       │
       │ Procesar
       ▼
┌──────────────────┐
│    Message       │
│   Controller     │
└──────┬───────────┘
       │
       ├────────────┐
       │            │
       ▼            ▼
┌──────────┐  ┌──────────┐
│  Gemini  │  │ Session  │
│ Service  │  │ Manager  │
└─────┬────┘  └──────────┘
      │
      │ Detectar intención
      ▼
┌──────────────────┐
│  ¿Agendar        │
│  reunión?        │
└──────┬───────────┘
       │
       │ Sí
       ▼
┌──────────────────┐
│   Calendar       │
│   Service        │
└──────┬───────────┘
       │
       │ Verificar + Crear
       ▼
┌──────────────────┐
│ Google Calendar  │
│      API         │
└──────┬───────────┘
       │
       │ Confirmar
       ▼
┌──────────────────┐
│   WhatsApp       │
│   Service        │
└──────┬───────────┘
       │
       │ Enviar respuesta
       ▼
┌──────────────────┐
│     Usuario      │
└──────────────────┘
```

## Componentes Principales

### 1. Server (server.js)

**Responsabilidades:**
- Inicializar Express.js
- Configurar middleware de seguridad (Helmet, Rate Limiting)
- Registrar rutas
- Manejo global de errores

**Tecnologías:**
- Express.js 4.x
- Helmet (seguridad)
- Express Rate Limit

### 2. Webhook Router (src/routes/webhook.js)

**Responsabilidades:**
- Verificación del webhook (GET)
- Recepción de mensajes (POST)
- Validación de estructura
- Respuesta inmediata a WhatsApp (200 OK)

**Endpoints:**
```
GET  /webhook  → Verificación
POST /webhook  → Recepción de mensajes
```

### 3. Message Controller (src/controllers/messageController.js)

**Responsabilidades:**
- Orquestación del flujo de mensajes
- Gestión de sesiones de usuario
- Detección de intenciones
- Coordinación entre servicios

**Funciones principales:**
```javascript
- processMessage(message, metadata)
- handleScheduleRequest(phone, scheduleData, session)
- showAvailableSlots(phone)
- getSession(phone)
- cleanOldSessions()
```

### 4. WhatsApp Service (src/services/whatsappService.js)

**Responsabilidades:**
- Envío de mensajes de texto
- Envío de mensajes interactivos (botones, listas)
- Marcar mensajes como leídos
- Manejo de errores de API

**Métodos:**
```javascript
- sendTextMessage(to, text)
- sendButtonMessage(to, bodyText, buttons)
- sendListMessage(to, bodyText, buttonText, sections)
- markAsRead(messageId)
```

**API Utilizada:**
- WhatsApp Cloud API v18.0
- Endpoint: graph.facebook.com

### 5. Gemini Service (src/services/geminiService.js)

**Responsabilidades:**
- Generación de respuestas con IA
- Detección de intenciones de agendamiento
- Parsing de información estructurada
- Generación de confirmaciones

**Métodos:**
```javascript
- generateResponse(userMessage, conversationHistory)
- parseScheduleIntent(aiResponse)
- cleanResponse(aiResponse)
- generateMeetingSummary(meetingData)
```

**Formato de Intención:**
```
[INTENT:SCHEDULE]
[NAME:Juan Pérez]
[REASON:Consultoría]
[DATE:2025-01-15]
[TIME:14:00]
[/INTENT]
```

### 6. Calendar Service (src/services/calendarService.js)

**Responsabilidades:**
- Autenticación OAuth2 con Google
- Verificación de disponibilidad
- Creación de eventos
- Consulta de horarios disponibles
- Cancelación de eventos

**Métodos:**
```javascript
- checkAvailability(date, time, duration)
- createEvent(meetingData)
- getAvailableSlots(daysAhead, slotsPerDay)
- cancelEvent(eventId)
```

**Validaciones:**
- Horario de negocio (9 AM - 6 PM)
- Días laborables (L-V)
- Fechas futuras
- Conflictos de horario

### 7. Logger (src/utils/logger.js)

**Responsabilidades:**
- Registro de eventos
- Logging a archivos
- Diferentes niveles (error, warn, info, debug)
- Formato estructurado

**Niveles:**
```
error → Errores críticos
warn  → Advertencias
info  → Información general
http  → Requests HTTP
debug → Debugging (solo development)
```

### 8. Helpers (src/utils/helpers.js)

**Funciones auxiliares:**
```javascript
- isValidWhatsAppNumber(phone)
- formatWhatsAppNumber(phone)
- isValidDate(dateString)
- isValidTime(timeString)
- formatDateTime(date, time)
- extractDateFromText(text)
- extractTimeFromText(text)
- sanitizeText(text)
```

## Flujo Detallado de Mensaje

### 1. Recepción

```javascript
POST /webhook
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [{
          "from": "5215512345678",
          "type": "text",
          "text": { "body": "Quiero agendar" }
        }]
      }
    }]
  }]
}
```

### 2. Procesamiento

```javascript
// messageController.js

1. Marcar como leído
2. Obtener/crear sesión del usuario
3. Agregar mensaje al historial
4. Enviar a Gemini para procesar
5. Detectar intención
```

### 3. Detección de Intención

```javascript
// geminiService.js

AI analiza el mensaje y contexto
→ Responde con formato especial si detecta intención de agendar
→ O responde normalmente
```

### 4. Validación de Disponibilidad

```javascript
// calendarService.js

1. Parsear fecha y hora
2. Validar horario de negocio
3. Validar día laborable
4. Consultar Google Calendar
5. Retornar disponibilidad
```

### 5. Creación de Evento

```javascript
// calendarService.js

Si disponible:
1. Crear objeto de evento
2. Enviar a Google Calendar API
3. Retornar eventId y link
```

### 6. Respuesta al Usuario

```javascript
// whatsappService.js

1. Generar mensaje de confirmación
2. Enviar vía WhatsApp Cloud API
3. Incluir link del evento
```

## Sistema de Sesiones

### Estructura de Sesión

```javascript
{
  phone: "5215512345678",
  history: [
    { role: "usuario", content: "Hola" },
    { role: "asistente", content: "¡Hola! ¿En qué puedo ayudarte?" }
  ],
  pendingIntent: null,
  lastEvent: {
    eventId: "abc123",
    startDateTime: "2025-01-15T14:00:00",
  },
  lastActivity: 1705334400000,
  createdAt: 1705330800000
}
```

### Ciclo de Vida

```
Creación → Primera interacción
Uso      → Cada mensaje actualiza lastActivity
Limpieza → Después de 24h sin actividad
```

**Almacenamiento:**
- Desarrollo: Map() en memoria
- Producción recomendada: Redis

## Seguridad

### Capas de Seguridad

1. **Helmet.js**
   - Headers HTTP seguros
   - Protección XSS
   - Content Security Policy

2. **Rate Limiting**
   - 100 requests por 15 minutos por IP
   - Protección contra DDoS
   - Solo en endpoint /webhook

3. **Validación de Webhook**
   - Verificación de token
   - Validación de estructura
   - Sanitización de inputs

4. **Variables de Entorno**
   - No hay credenciales en código
   - .env en .gitignore
   - Validación al inicio

5. **Logs Seguros**
   - No registrar credenciales
   - No registrar datos sensibles
   - Formato estructurado

## Escalabilidad

### Arquitectura Actual
```
Single Process
├── Express Server
├── In-Memory Sessions
└── Synchronous Processing
```

### Recomendaciones para Escalar

#### Nivel 1: Optimización Básica
```javascript
// Redis para sesiones
const redis = require('redis');
const client = redis.createClient();

// Session distribuida
const session = require('express-session');
const RedisStore = require('connect-redis')(session);
```

#### Nivel 2: Queue System
```javascript
// Bull para procesamiento asíncrono
const Queue = require('bull');
const messageQueue = new Queue('messages');

messageQueue.process(async (job) => {
  await processMessage(job.data);
});
```

#### Nivel 3: Microservicios
```
┌──────────┐
│  API     │
│ Gateway  │
└────┬─────┘
     │
     ├─────────┬─────────┬─────────┐
     ▼         ▼         ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐
│ Message│ │Gemini  │ │Calendar│ │WhatsApp│
│Service │ │Service │ │Service │ │Service │
└────────┘ └────────┘ └────────┘ └────────┘
```

#### Nivel 4: Kubernetes
```yaml
# deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whatsapp-bot
spec:
  replicas: 3
  template:
    spec:
      containers:
      - name: bot
        image: whatsapp-bot:latest
```

## Monitoreo

### Métricas Clave

1. **Performance**
   - Tiempo de respuesta de webhook
   - Tiempo de procesamiento de mensaje
   - Tiempo de respuesta de APIs externas

2. **Disponibilidad**
   - Uptime del servidor
   - Tasa de error de webhooks
   - Tasa de éxito de APIs

3. **Negocio**
   - Mensajes procesados por día
   - Reuniones agendadas
   - Tasa de conversión

### Herramientas Recomendadas

- **Logs**: Winston + ELK Stack
- **APM**: New Relic / DataDog
- **Errores**: Sentry
- **Uptime**: UptimeRobot / Pingdom

## Mantenimiento

### Tareas Regulares

1. **Diario**
   - Revisar logs de error
   - Monitorear tasa de éxito

2. **Semanal**
   - Limpiar logs antiguos
   - Revisar métricas de uso

3. **Mensual**
   - Actualizar dependencias
   - Revisar cuotas de APIs
   - Backup de configuración

### Troubleshooting

```javascript
// Habilitar debug logging
NODE_ENV=development node server.js

// Ver logs en tiempo real
tail -f logs/combined.log

// Verificar configuración
node scripts/checkSetup.js
```

## Extensiones Futuras

### Funcionalidades Sugeridas

1. **Multi-idioma**
   - Detección automática de idioma
   - Respuestas en español/inglés

2. **Recordatorios**
   - Enviar recordatorio 24h antes
   - Confirmación de asistencia

3. **Reprogramación**
   - Cambiar fecha/hora existente
   - Sugerir nuevos horarios

4. **Analytics**
   - Dashboard de métricas
   - Reportes de uso

5. **CRM Integration**
   - Guardar leads en CRM
   - Historial de interacciones

6. **Payment Integration**
   - Cobro de citas
   - Reserva con pago

## Contacto y Soporte

Para preguntas sobre la arquitectura:
- Revisa la documentación en README.md
- Consulta los ejemplos en EJEMPLOS_CONVERSACION.md
- Revisa los logs en /logs/
