# Guía de Personalización del Chatbot IA

Esta guía te muestra cómo personalizar completamente el chatbot para tu negocio específico. El sistema está diseñado para actuar como un **vendedor consultivo real**, no como un bot automático.

## Cómo Funciona el Sistema

### Flujo de Conversación

1. **Usuario escribe a WhatsApp** → mensaje llega al webhook
2. **Sistema califica al lead** → detecta qué tan interesado está (frío/tibio/caliente)
3. **IA genera respuesta** → usando el contexto de tu negocio y el nivel de interés
4. **Conversación natural** → la IA maneja objeciones, descubre necesidades, presenta valor
5. **Invita a agendar** → cuando el lead está calificado y muestra señales de interés
6. **Agenda reunión** → crea el evento automáticamente en Google Calendar

### Diferencia con un Bot Tradicional

❌ **Bot Tradicional:**
```
Usuario: Hola
Bot: Bienvenido. ¿En qué puedo ayudarte? [Opciones predefinidas]
```

✅ **IA Conversacional:**
```
Usuario: Hola, estoy buscando formas de mejorar mis ventas online
IA: ¡Hola! Entiendo que buscas mejorar tus ventas online.
    Cuéntame, ¿qué has intentado hasta ahora y qué resultados has visto?
```

La IA hace preguntas inteligentes, se adapta al contexto, y conduce la conversación naturalmente.

---

## Archivo Principal: business-knowledge.json

Este archivo es el **cerebro** de tu chatbot. Contiene toda la información sobre tu negocio.

### Estructura del Archivo

```json
{
  "company": {...},           // Información de tu empresa
  "services": [...],          // Servicios que ofreces
  "case_studies": [...],      // Casos de éxito
  "faqs": [...],              // Preguntas frecuentes
  "target_audience": {...},   // Cliente ideal
  "conversation_guidelines": {...}, // Cómo debe conversar
  "lead_qualification": {...}, // Señales de interés
  "meeting_invitation_triggers": {...} // Cuándo invitar a agendar
}
```

---

## Paso 1: Configura tu Empresa

### company

```json
{
  "company": {
    "name": "TU NOMBRE DE EMPRESA",
    "industry": "Tu industria",
    "description": "Una descripción concisa de qué hace tu empresa",
    "tone": "Define el tono: profesional pero cercano, formal, casual, etc."
  }
}
```

**Ejemplo para una agencia inmobiliaria:**
```json
{
  "company": {
    "name": "Inmobiliaria Prime",
    "industry": "Bienes Raíces Residenciales",
    "description": "Ayudamos a familias a encontrar su hogar ideal en la mejor ubicación y al mejor precio",
    "tone": "amigable y empático, como un asesor de confianza"
  }
}
```

---

## Paso 2: Define tus Servicios

### services

Para cada servicio, incluye:
- **name**: Nombre del servicio
- **description**: Qué es y qué hace
- **benefits**: Lista de beneficios concretos
- **ideal_for**: Tipo de cliente ideal
- **price_range**: Rango de precios (opcional)

**Ejemplo:**
```json
{
  "services": [
    {
      "name": "Búsqueda Personalizada de Propiedades",
      "description": "Te ayudamos a encontrar la propiedad perfecta según tus necesidades, presupuesto y ubicación preferida",
      "benefits": [
        "Acceso a propiedades exclusivas",
        "Ahorra tiempo visitando solo opciones relevantes",
        "Negociamos el mejor precio por ti"
      ],
      "ideal_for": "Familias o personas que buscan comprar su primera casa o invertir",
      "price_range": "sin costo, ganamos comisión del vendedor"
    }
  ]
}
```

**Tip:** Enfócate en BENEFICIOS (qué gana el cliente) no solo en características.

---

## Paso 3: Agrega Casos de Éxito

### case_studies

Los casos de éxito son poderosos para construir credibilidad.

```json
{
  "case_studies": [
    {
      "industry": "Industria del cliente",
      "challenge": "Problema que tenían",
      "solution": "Cómo lo resolviste",
      "result": "Resultados concretos"
    }
  ]
}
```

**Ejemplo:**
```json
{
  "case_studies": [
    {
      "industry": "Restaurante Local",
      "challenge": "Bajo tráfico de clientes y sin presencia digital",
      "solution": "Implementamos estrategia de Google My Business + Instagram Ads",
      "result": "150% de aumento en reservas en 2 meses"
    }
  ]
}
```

---

## Paso 4: Responde Preguntas Frecuentes

### faqs

Incluye las preguntas que tus clientes hacen constantemente.

```json
{
  "faqs": [
    {
      "question": "¿Cuánto cobran?",
      "answer": "Nuestros paquetes empiezan desde $500 USD/mes. El costo exacto depende del alcance del proyecto. ¿Te gustaría que platicáramos para darte un estimado preciso?"
    }
  ]
}
```

**Tip:** En las respuestas, incluye una pregunta que continúe la conversación.

---

## Paso 5: Define tu Cliente Ideal

### target_audience

```json
{
  "target_audience": {
    "ideal_clients": [
      "Tipo de cliente 1",
      "Tipo de cliente 2"
    ],
    "pain_points": [
      "Problema común 1",
      "Problema común 2"
    ]
  }
}
```

**Ejemplo:**
```json
{
  "target_audience": {
    "ideal_clients": [
      "Dueños de restaurantes que quieren más clientes",
      "Gimnasios que necesitan llenar cupo",
      "Tiendas locales sin presencia online"
    ],
    "pain_points": [
      "No saben cómo usar redes sociales para vender",
      "Gastan en publicidad sin ver resultados",
      "No tienen tiempo para el marketing"
    ]
  }
}
```

---

## Paso 6: Guía la Conversación

### conversation_guidelines

Define qué DEBE y NO DEBE hacer la IA.

```json
{
  "conversation_guidelines": {
    "do": [
      "Hacer preguntas abiertas sobre el negocio del prospecto",
      "Personalizar respuestas según la industria"
    ],
    "dont": [
      "No usar jerga técnica",
      "No dar precios exactos sin contexto"
    ]
  }
}
```

---

## Paso 7: Calificación de Leads

### lead_qualification

El sistema califica automáticamente cada lead como:
- 🔥 **HOT (Caliente)**: Listo para agendar
- 🟡 **WARM (Tibio)**: Interesado, necesita más información
- ❄️ **COLD (Frío)**: Solo explorando

Define las **señales** que indican cada nivel:

```json
{
  "lead_qualification": {
    "hot_lead_signals": [
      "Pregunta por precios específicos",
      "Menciona presupuesto disponible",
      "Tiene urgencia"
    ],
    "warm_lead_signals": [
      "Hace preguntas sobre servicios",
      "Comparte información de su negocio"
    ],
    "cold_lead_signals": [
      "Preguntas muy generales",
      "Respuestas cortas"
    ]
  }
}
```

**Cómo funciona:**
- El sistema analiza el lenguaje del prospecto
- Detecta estas señales automáticamente
- Ajusta su estrategia de conversación según el nivel

---

## Paso 8: Cuándo Invitar a Agendar

### meeting_invitation_triggers

Define **cuándo** la IA debe invitar a agendar una llamada.

```json
{
  "meeting_invitation_triggers": {
    "when_to_invite": [
      "El lead ha hecho al menos 3 preguntas relacionadas",
      "Ha compartido información de su negocio",
      "Ha mostrado interés en servicios específicos"
    ],
    "invitation_phrases": [
      "Me encantaría platicarte más a detalle. ¿Tienes 30 min esta semana?",
      "Tengo algunas ideas para tu caso. ¿Agendamos una llamada?"
    ]
  }
}
```

**Importante:** La IA solo invita cuando el lead está **calificado**. No presiona a leads fríos.

---

## Ejemplos Completos por Industria

### Ejemplo 1: Agencia de Marketing

<details>
<summary>Ver configuración completa</summary>

```json
{
  "company": {
    "name": "Growth Marketing Pro",
    "industry": "Marketing Digital",
    "description": "Ayudamos a negocios locales a conseguir más clientes con publicidad en Meta y Google",
    "tone": "profesional pero accesible, como un socio estratégico"
  },
  "services": [
    {
      "name": "Campañas de Meta Ads",
      "description": "Creamos y optimizamos campañas en Facebook e Instagram",
      "benefits": [
        "Más clientes potenciales calificados",
        "ROI medible desde el día 1",
        "Segmentación precisa de audiencia"
      ],
      "ideal_for": "Negocios locales con presupuesto de $1000+ USD/mes",
      "price_range": "desde $800 USD/mes + presupuesto de ads"
    }
  ],
  "case_studies": [
    {
      "industry": "Clínica Dental",
      "challenge": "Necesitaban pacientes nuevos",
      "solution": "Campañas de Facebook Ads con ofertas especiales",
      "result": "47 pacientes nuevos en el primer mes"
    }
  ]
}
```
</details>

### Ejemplo 2: Consultoría de Negocios

<details>
<summary>Ver configuración completa</summary>

```json
{
  "company": {
    "name": "BizConsult Pro",
    "industry": "Consultoría Empresarial",
    "description": "Ayudamos a PyMEs a optimizar sus operaciones y aumentar rentabilidad",
    "tone": "formal y ejecutivo, como un CFO externo"
  },
  "services": [
    {
      "name": "Diagnóstico Operacional",
      "description": "Análisis completo de tu operación para identificar ineficiencias",
      "benefits": [
        "Identifica áreas de mejora inmediata",
        "Plan de acción concreto",
        "ROI típico de 3x en 6 meses"
      ],
      "ideal_for": "Empresas de 10-50 empleados con problemas de rentabilidad",
      "price_range": "$2,500 - $5,000 USD"
    }
  ]
}
```
</details>

### Ejemplo 3: E-commerce

<details>
<summary>Ver configuración completa</summary>

```json
{
  "company": {
    "name": "TuTienda Online",
    "industry": "E-commerce",
    "description": "Vendemos productos artesanales hechos a mano en México",
    "tone": "casual y amigable, como un amigo recomendando algo bueno"
  },
  "services": [
    {
      "name": "Productos Artesanales",
      "description": "Artesanías auténticas hechas por artesanos mexicanos",
      "benefits": [
        "Calidad garantizada",
        "Envío gratis en compras de $500+",
        "Apoyas directamente a artesanos locales"
      ],
      "ideal_for": "Personas que buscan regalos únicos o decoración auténtica",
      "price_range": "$100 - $2,000 MXN"
    }
  ]
}
```
</details>

---

## Ajustes Avanzados

### Temperatura de la IA

En `src/services/geminiService.js`, línea 203:

```javascript
temperature: 0.8, // 0.0 = muy predecible, 1.0 = muy creativo
```

- **0.3-0.5**: Respuestas más consistentes y formales
- **0.7-0.8**: Balance entre creatividad y coherencia (recomendado)
- **0.9-1.0**: Muy creativo, puede ser impredecible

### Longitud de Respuestas

En el prompt del `business-knowledge.json`:

```json
"# ESTILO DE RESPUESTA\n- Responde en 2-4 líneas máximo"
```

Ajusta según prefieras respuestas más cortas o más detalladas.

### Criterios de Calificación

Ajusta los puntajes en `src/services/geminiService.js`, líneas 252-265:

```javascript
score += hotSignals.length * 3;  // Peso de señales calientes
score += warmSignals.length * 2; // Peso de señales tibias
score -= coldSignals.length * 1; // Penalización por señales frías

if (score >= 7 || hotSignals.length >= 2) {
  temperature = 'hot'; // Ajusta estos umbrales
}
```

---

## Testing y Optimización

### 1. Prueba Conversaciones Reales

Envía mensajes de WhatsApp y revisa:
- ¿La IA suena humana?
- ¿Hace preguntas inteligentes?
- ¿Invita a agendar en el momento correcto?

### 2. Revisa los Logs

```bash
tail -f logs/combined.log
```

Busca:
- `📊 Lead calificado` → temperatura y score
- `✅ Respuesta generada` → confirma que funciona

### 3. Ajusta el Knowledge Base

Después de 10-20 conversaciones, identifica:
- Preguntas que la IA no respondió bien
- Objeciones comunes que falta manejar
- Casos de éxito que podrías agregar

---

## Mejores Prácticas

### ✅ Hacer

1. **Sé específico** en los beneficios de tus servicios
2. **Usa lenguaje de tu audiencia** (no jerga técnica si tu cliente no la usa)
3. **Actualiza casos de éxito** con resultados reales
4. **Prueba el tono** enviando mensajes tú mismo
5. **Monitorea las conversaciones** las primeras semanas

### ❌ Evitar

1. **No hagas promesas** que no puedes cumplir
2. **No uses demasiada jerga** técnica
3. **No fuerces el agendamiento** demasiado pronto
4. **No des precios exactos** sin entender el contexto
5. **No ignores las objeciones** comunes en los FAQs

---

## Flujo de Trabajo Recomendado

### Semana 1: Configuración Inicial
1. Completa `business-knowledge.json` con tu información
2. Haz al menos 10 conversaciones de prueba
3. Ajusta respuestas que no te gusten

### Semana 2: Optimización
1. Agrega FAQs que surgieron en conversaciones reales
2. Ajusta los criterios de calificación de leads
3. Refina el tono si suena muy formal/informal

### Semana 3+: Mantenimiento
1. Actualiza casos de éxito con nuevos resultados
2. Agrega nuevos servicios o promociones
3. Optimiza las frases de invitación a agendar

---

## Recursos Adicionales

- **README.md**: Instalación y configuración técnica
- **ARQUITECTURA.md**: Cómo funciona el sistema por dentro
- **EJEMPLOS_CONVERSACION.md**: Ejemplos de flujos de conversación
- **logs/combined.log**: Revisa todas las interacciones

---

## Soporte

Si necesitas ayuda con la personalización:
1. Revisa los logs para ver qué está pasando
2. Verifica que `business-knowledge.json` esté en formato JSON válido
3. Prueba con mensajes simples primero, luego más complejos

El sistema mejora con el tiempo mientras más conversaciones tenga y más ajustes hagas.
