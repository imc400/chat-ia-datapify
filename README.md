# Datapify - WhatsApp AI Sales Agent con Método Socrático

Sistema de chat con **Inteligencia Artificial conversacional** para WhatsApp que usa el **método socrático** para calificar leads y agendar reuniones de onboarding automáticamente.

**🎯 Específicamente para:** Datapify - Plataforma SaaS que simplifica Meta Ads para tiendas Shopify.

**💡 Diferenciador clave:** No vende directamente. Hace preguntas estratégicas que llevan al cliente a **descubrir su propio problema**, creando compromiso genuino antes de agendar.

## Lo que hace diferente a este sistema

### ❌ Bot Tradicional
```
Bot: ¡Hola! Somos Datapify. Ofrecemos:
     • Gestión de Meta Ads
     • Segmentos inteligentes
     • $199 USD/mes
     ¿Quieres agendar una demo?

Usuario: [No responde, abrumado con información]
```

### ✅ Este Sistema (Método Socrático + IA)
```
IA: Hola! ¿Tu sitio está en Shopify?
Usuario: Sí
IA: Buenísimo. ¿Cómo van esas ventas?
Usuario: Mal, se han caído
IA: Uff entiendo. ¿Están invirtiendo en publicidad?
Usuario: Sí pero no funciona
IA: ¿Cuánto te gustaría estar vendiendo?
Usuario: El doble
IA: ¿Qué crees que falta para llegar ahí?
Usuario: Mejor publicidad supongo
IA: Sii. ¿Te tinca si agendamos una reunión para ver cómo mejorar eso?
Usuario: Sí porfa
```

**Diferencias clave:**
- ✅ **Método socrático:** El cliente descubre el problema por sí mismo
- ✅ **Calificación inteligente:** Verifica Shopify y nivel de ventas PRIMERO
- ✅ **Lenguaje natural chileno:** "demás", "te tinca", "palos"
- ✅ **Validación emocional:** "Uff entiendo", "tranquilo que te podemos ayudar"
- ✅ **No vende hasta que el lead esté calificado:** Enfoque en descubrimiento
- ✅ **Preguntas cortas:** Una a la vez, fáciles de responder

## Características Principales

### 🤖 IA Conversacional Avanzada
- Powered by Gemini AI con prompt engineering profesional
- Estrategia de ventas consultiva en 4 fases: Apertura → Descubrimiento → Valor → Cierre
- Respuestas personalizadas según el contexto y nivel de interés
- Sistema de memoria conversacional

### 📊 Calificación Automática de Leads
- Análisis en tiempo real del nivel de interés (Hot/Warm/Cold)
- Score de 0-10 basado en señales de compra
- Adaptación de estrategia según temperatura del lead
- Logging de todas las interacciones para análisis

### 🎯 Manejo Inteligente de Ventas
- Descubrimiento de necesidades mediante preguntas abiertas
- Presentación de valor con casos de éxito relevantes
- Manejo de objeciones comunes (FAQs)
- Invitación a agendar en el momento óptimo

### 📅 Agendamiento Automático
- Integración con Google Calendar
- Validación de disponibilidad en tiempo real
- Confirmación automática con link de reunión
- Recordatorios configurables

### 🛡️ Producción-Ready
- Webhook de WhatsApp Cloud API funcional
- Manejo robusto de errores
- Sistema de logs con Winston
- Rate limiting y seguridad con Helmet
- Arquitectura modular y escalable

## Requisitos Previos

- Node.js >= 16.0.0
- Cuenta de Meta for Developers (WhatsApp Cloud API)
- API Key de Google Gemini
- Cuenta de Google Cloud con Calendar API habilitado
- URL pública para webhook (usar ngrok en desarrollo)

## Estructura del Proyecto

```
.
├── server.js                 # Servidor principal
├── package.json
├── .env.example             # Plantilla de variables de entorno
├── .gitignore
├── src/
│   ├── config/
│   │   └── index.js         # Configuración centralizada
│   ├── controllers/
│   │   └── messageController.js  # Lógica principal del bot
│   ├── services/
│   │   ├── whatsappService.js   # Envío de mensajes WhatsApp
│   │   ├── geminiService.js     # Procesamiento con IA
│   │   └── calendarService.js   # Operaciones de Calendar
│   ├── routes/
│   │   └── webhook.js       # Rutas del webhook
│   ├── utils/
│   │   ├── logger.js        # Sistema de logs
│   │   └── helpers.js       # Funciones auxiliares
│   └── middleware/          # Middleware personalizado
└── logs/                    # Archivos de log
```

## Instalación

### 1. Clonar e instalar dependencias

```bash
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Edita el archivo `.env` con tus credenciales.

### 3. Configurar WhatsApp Cloud API

#### a) Crear App en Meta for Developers

1. Ve a https://developers.facebook.com/apps
2. Crea una nueva app de tipo "Business"
3. Agrega el producto "WhatsApp"

#### b) Obtener credenciales

- **PHONE_NUMBER_ID**: En el panel de WhatsApp, copia el "Phone number ID"
- **ACCESS_TOKEN**: Genera un token de acceso permanente en "Configuración > Tokens de acceso"

#### c) Configurar Webhook

1. En desarrollo, expón tu servidor local con ngrok:
   ```bash
   ngrok http 3000
   ```

2. En Meta Developers > WhatsApp > Configuración:
   - URL del webhook: `https://tu-url-ngrok.ngrok.io/webhook`
   - Token de verificación: el valor de `WHATSAPP_VERIFY_TOKEN` en tu .env
   - Suscríbete al campo: `messages`

### 4. Configurar Gemini AI

1. Ve a https://makersuite.google.com/app/apikey
2. Crea una API key
3. Copia el valor en `GEMINI_API_KEY`

### 5. Configurar Google Calendar API

#### a) Crear proyecto en Google Cloud

1. Ve a https://console.cloud.google.com/
2. Crea un proyecto nuevo
3. Habilita "Google Calendar API"

#### b) Crear credenciales OAuth 2.0

1. Ve a "APIs y servicios > Credenciales"
2. Crea credenciales OAuth 2.0
3. Agrega URI de redirección: `http://localhost:3000/oauth/callback`
4. Descarga el JSON de credenciales

#### c) Obtener Refresh Token

Necesitas ejecutar el flujo OAuth una vez para obtener el refresh_token:

```javascript
// Crear archivo: scripts/getRefreshToken.js
const { google } = require('googleapis');
const readline = require('readline');

const oauth2Client = new google.auth.OAuth2(
  'TU_CLIENT_ID',
  'TU_CLIENT_SECRET',
  'http://localhost:3000/oauth/callback'
);

const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
});

console.log('Autoriza esta app visitando:', authUrl);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('Ingresa el código de la URL de redirección: ', async (code) => {
  const { tokens } = await oauth2Client.getToken(code);
  console.log('Tu refresh_token es:', tokens.refresh_token);
  rl.close();
});
```

Ejecuta:
```bash
node scripts/getRefreshToken.js
```

Copia el `refresh_token` obtenido en tu archivo `.env`.

## 🎨 Personalización para tu Negocio (IMPORTANTE)

El sistema viene con información de ejemplo de "Datapify". **Debes personalizarlo con información de TU negocio.**

### Paso 1: Edita business-knowledge.json

Este archivo es el **cerebro** de tu IA. Aquí defines:
- Información de tu empresa
- Servicios que ofreces
- Casos de éxito
- Preguntas frecuentes
- Cliente ideal y pain points
- Estrategia de conversación

```bash
# Edita el archivo
nano business-knowledge.json
```

### Ejemplo de lo que debes cambiar:

```json
{
  "company": {
    "name": "TU EMPRESA",  // ← Cambia esto
    "industry": "Tu industria",
    "description": "Qué hace tu empresa",
    "tone": "profesional pero cercano"
  },
  "services": [
    {
      "name": "Tu Servicio Principal",
      "description": "Qué es y qué hace",
      "benefits": ["Beneficio 1", "Beneficio 2"],
      "ideal_for": "Tipo de cliente ideal",
      "price_range": "Rango de precios"
    }
  ],
  // ... más configuración
}
```

### Paso 2: Revisa la Guía de Personalización

Lee el archivo **PERSONALIZACION.md** para una guía completa con:
- Cómo funciona el sistema de IA conversacional
- Ejemplos por industria (marketing, consultoría, e-commerce, etc.)
- Mejores prácticas para cada sección
- Tips para optimizar conversaciones

```bash
cat PERSONALIZACION.md
```

### ⚠️ Importante

Sin personalizar `business-knowledge.json`, la IA responderá con información de ejemplo que **no es relevante para tu negocio**. Este paso es crítico para que funcione correctamente.

## Uso

### Iniciar el servidor

```bash
# Modo producción
npm start

# Modo desarrollo (con nodemon)
npm run dev
```

El servidor iniciará en el puerto configurado (default: 3000).

### Endpoints

- **GET /webhook**: Verificación del webhook (usado por Meta)
- **POST /webhook**: Recepción de mensajes de WhatsApp
- **GET /health**: Health check del servidor

### Probar el Bot

1. Asegúrate de que el servidor esté corriendo
2. Envía un mensaje de WhatsApp al número configurado
3. El bot responderá automáticamente

#### Ejemplos de conversación

```
Usuario: Hola, quiero agendar una reunión
Bot: Claro, estaré encantado de ayudarte. ¿Para cuándo te gustaría la reunión?

Usuario: Para mañana a las 10 AM
Bot: Perfecto. ¿Cuál es tu nombre y el motivo de la reunión?

Usuario: Me llamo Juan y quiero hablar sobre servicios de marketing
Bot: ✅ Reunión agendada con éxito para [fecha] a las 10:00...
```

## Configuración de Meta Ads

Para conectar con campañas de Meta Ads:

1. En Meta Business Suite, crea una campaña con objetivo "Mensajes"
2. Selecciona WhatsApp como destino
3. El tráfico llegará automáticamente al webhook configurado
4. El bot manejará todas las conversaciones

## Logs

Los logs se guardan en la carpeta `/logs`:

- `error.log`: Solo errores
- `combined.log`: Todos los logs

## Variables de Entorno

| Variable | Descripción | Requerida |
|----------|-------------|-----------|
| PORT | Puerto del servidor | No (default: 3000) |
| NODE_ENV | Entorno (development/production) | No |
| WHATSAPP_PHONE_NUMBER_ID | ID del número de WhatsApp | Sí |
| WHATSAPP_ACCESS_TOKEN | Token de acceso de WhatsApp | Sí |
| WHATSAPP_VERIFY_TOKEN | Token para verificar webhook | Sí |
| GEMINI_API_KEY | API key de Gemini | Sí |
| GOOGLE_CLIENT_ID | Client ID de Google OAuth | Sí |
| GOOGLE_CLIENT_SECRET | Client Secret de Google | Sí |
| GOOGLE_REFRESH_TOKEN | Refresh token de OAuth | Sí |
| BUSINESS_NAME | Nombre de tu negocio | No |
| DEFAULT_MEETING_DURATION | Duración de reuniones (minutos) | No (default: 60) |
| BUSINESS_HOURS_START | Hora de inicio (0-23) | No (default: 9) |
| BUSINESS_HOURS_END | Hora de fin (0-23) | No (default: 18) |

## Arquitectura

### Flujo de Mensajes

1. WhatsApp envía mensaje → Webhook POST `/webhook`
2. `messageController` procesa el mensaje
3. `geminiService` genera respuesta inteligente
4. Se detecta intención de agendamiento (si aplica)
5. `calendarService` verifica disponibilidad
6. Se crea evento en Google Calendar
7. `whatsappService` envía confirmación al usuario

### Sistema de Sesiones

Las sesiones se almacenan en memoria (Map):
- Se crea una sesión por cada número de teléfono
- Mantiene historial de conversación (últimos 10 mensajes)
- Se limpian automáticamente después de 24h de inactividad

En producción, se recomienda usar Redis para sesiones persistentes.

## Escalabilidad

### Para producción:

1. **Base de datos**: Agregar MongoDB/PostgreSQL para persistencia
2. **Cache**: Implementar Redis para sesiones
3. **Queue**: Usar Bull/RabbitMQ para procesar mensajes
4. **Monitoring**: Agregar Sentry/DataDog
5. **Load Balancer**: Nginx o AWS ELB
6. **Containerización**: Docker + Kubernetes

## Seguridad

- Rate limiting implementado (100 req/15min por IP)
- Helmet.js para headers de seguridad
- Validación de token de webhook
- Sanitización de inputs
- No se almacenan credenciales en código
- Logs excluyen información sensible

## Solución de Problemas

### El webhook no recibe mensajes

1. Verifica que la URL sea pública (usa ngrok en desarrollo)
2. Confirma que el VERIFY_TOKEN coincida en .env y Meta Developers
3. Revisa los logs en Meta Developers > WhatsApp > Webhooks

### Error al agendar en Calendar

1. Verifica que el refresh_token sea válido
2. Confirma que Calendar API esté habilitada
3. Revisa permisos del OAuth (scope: calendar)

### Gemini no responde

1. Verifica que la API key sea válida
2. Confirma que tengas cuota disponible
3. Revisa los logs en `logs/error.log`

## Soporte

Para problemas o preguntas:
- Revisa los logs en `/logs`
- Verifica la configuración de .env
- Consulta la documentación de las APIs

## Licencia

MIT

## Autor

Datapify - 2025
