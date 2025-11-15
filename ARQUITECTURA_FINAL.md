# 🎯 Arquitectura Final - Agente Conversacional Datapify

**Versión:** 3.0 - Simplificación Radical
**Fecha:** 2025-11-14
**Filosofía:** Menos reglas, más IA natural

---

## 🧠 Filosofía de Diseño

### **Problema anterior:**
Estábamos **sobre-engineerizado** → 320 líneas de lógica compleja, 50+ reglas simultáneas, scripts detallados.

**Resultado:** LLM confundido, respuestas robóticas, inventaba frustraciones.

### **Solución:**
**Confiar en el LLM (GPT-4o)**. Es inteligente. Solo necesita:
1. Objetivo claro
2. Contexto de lo que sabe/falta
3. Ejemplos de tono
4. Libertad para ejecutar

---

## 📐 Arquitectura Actual

### **Capa 1: System Prompt (50 líneas)**

Minimalista. Define:
- **Objetivo:** Calificar leads y agendar demos
- **Personalidad:** Chileno natural, sin formalidades
- **Info necesaria:** 4 puntos clave (tienda, plataforma, producto, dolor)
- **Reglas críticas:** 6 principios (no asumir, no interrogar, etc.)

**Archivo:** `src/services/openaiService.js` (líneas 46-103)

```javascript
Eres Javier, vendedor chileno de Datapify.

TU OBJETIVO:
Calificar si es fit para Datapify y agendar demo de 30 min.

LO QUE NECESITAS SABER:
1. ¿Tiene tienda online?
2. ¿Qué plataforma? (necesitas Shopify)
3. ¿Qué vende?
4. ¿Tiene problemas con publicidad/ventas?

IMPORTANTE:
• NO asumas nada. Pregunta.
• NO inventes frustraciones.
• NO des consultoría gratis.
• Conversa natural, ve paso a paso.
```

---

### **Capa 2: Behaviour Controller (60 líneas)**

Analiza conversación y genera **contexto simple** (no scripts).

**Archivo:** `src/services/behaviourController.js` (líneas 267-332)

#### **Variables rastreadas:**
- `hasOnlineStore`: ¿Tiene tienda?
- `platform`: ¿Shopify confirmado?
- `hasBusinessInfo`: ¿Qué vende?
- `hasPainPoint`: ¿Expresó frustración/problema?
- `askedAboutAds`: ¿Ya preguntamos por publicidad?

#### **Output: Instrucciones tipo "GPS"**

En vez de scripts detallados, le da:

```
━━━ LO QUE SABES ━━━
- Plataforma: Shopify
- Vende: zapatos

━━━ LO QUE TE FALTA SABER ━━━
- ¿Cómo le va con publicidad/ventas? ¿Tiene problemas?

Descubre esto conversando natural. NO hagas lista de preguntas.
```

---

### **Capa 3: Orchestration Service**

Valida límites básicos (sin sobre-controlar):
- Máx 400 caracteres (500 en cierre)
- Máx 5 líneas
- Máx 2 preguntas
- Detecta frases corporativas (warning, no blocking)

**Archivo:** `src/services/orchestrationService.js`

---

## 🔄 Flujo de Calificación

### **Estados del Lead:**

```
APERTURA (mensaje 1-2)
  ↓ Pregunta inicial natural

DESCUBRIMIENTO
  ├─→ No sabe si tiene tienda → Pregunta
  └─→ Tiene tienda pero no plataforma → Pregunta por Shopify

CALIFICACIÓN (tiene Shopify)
  ├─→ No preguntó por ads → Pregunta cómo le va
  ├─→ Preguntó pero sin dolor claro → Profundiza
  └─→ DOLOR confirmado → PROPUESTA

PROPUESTA
  └─→ Ofrece reunión: "¿Te tinca una llamada de 30 min?"

CIERRE
  └─→ Espera confirmación → Envía link Calendar
```

---

## 🎯 Detector de Pain Points

**18 señales de dolor rastreadas:**
- "no vendo", "ventas bajas", "pocas ventas"
- "no funciona", "frustrado", "cansado"
- "gasto mucho", "pierdo plata"
- "ads no funcionan", "sin resultados"
- etc.

Solo cuando detecta **Shopify + Pain Point** → ofrece reunión.

---

## 📊 Métricas de Simplificación

| Métrica | Antes | Ahora | Cambio |
|---------|-------|-------|--------|
| **System Prompt** | 120 líneas | 50 líneas | -58% |
| **Instrucciones dinámicas** | 200 líneas | 60 líneas | -70% |
| **Total complejidad** | 320 líneas | 134 líneas | **-58%** |
| **Reglas simultáneas** | 50+ | 6 | **-88%** |

---

## ✅ Conversación Ideal

```
Usuario: "Hola, quiero más información"
Bot: "Hola! ¿Qué onda? ¿Tienes tienda online?"

Usuario: "Sí, uso Shopify"
Bot: "Buena! ¿Qué vendes?"

Usuario: "Zapatos de cuero"
Bot: "¿Cómo te va? ¿Inviertes en publicidad?"

Usuario: "Mal, gasto mucho y no vendo"
Bot: "Cacho. ¿Te tinca una llamada de 30 min?"

Usuario: "Dale"
Bot: "Dale, te paso el link"
[Sistema envía link Calendar automático]
```

---

## 🚫 Lo que NO hace

- ❌ Inventar frustraciones donde no existen
- ❌ Ofrecer reunión sin confirmar dolor
- ❌ Asumir plataforma Shopify
- ❌ Dar consultoría técnica gratis
- ❌ Hacer interrogatorio (lista de preguntas)
- ❌ Sonar corporativo/formal
- ❌ Inventar horarios específicos

---

## 🔧 Parámetros OpenAI

```javascript
model: 'gpt-4o'              // Más inteligente
temperature: 0.9             // Creativo y natural
max_tokens: 200              // Respuestas sustanciales
top_p: 0.95                  // Sampling enfocado
frequency_penalty: 0.5       // Evita repeticiones
presence_penalty: 0.6        // Fomenta nuevos temas
```

---

## 📝 Principios de Diseño

### **1. Confía en el LLM**
GPT-4o es inteligente. Puede decidir cómo preguntar naturalmente.

### **2. Contexto > Scripts**
Dale información de lo que sabe/falta, no le dictes palabras exactas.

### **3. Libertad controlada**
Límites básicos (caracteres, líneas) pero flexibilidad en ejecución.

### **4. Natural > Perfecto**
Mejor conversación orgánica que script perfecto robótico.

### **5. Paso a paso**
Descubre info de forma progresiva, no todo de una vez.

---

## 🎨 Tono y Personalidad

**Javier:** Vendedor chileno, natural, directo, empático.

**Ejemplos de su lenguaje:**
- "Cacho" (no "Entiendo")
- "¿Te tinca?" (no "¿Te parece bien?")
- "Dale" (no "Perfecto, procedemos")
- "¿Qué onda?" (no "¿En qué puedo ayudarle?")

**Evita:**
- Frases corporativas
- Lenguaje formal
- Listas de preguntas
- Ofrecer sin contexto

---

## 🔄 Integración WhatsApp + Calendar

1. Usuario confirma reunión ("sí", "dale", "ok", etc.)
2. Bot responde: "Dale, te paso el link"
3. Sistema detecta confirmación automáticamente
4. Envía link de Google Calendar
5. Usuario elige fecha/hora en el calendario

**NO hay coordinación manual de horarios.**

---

## 📂 Archivos Clave

```
src/
├── services/
│   ├── openaiService.js           # System Prompt + Generación
│   ├── behaviourController.js     # Análisis estado + Contexto
│   ├── orchestrationService.js    # Validación + Formato
│   └── conversationService.js     # Persistencia BD
├── controllers/
│   └── messageController.js       # Orquestador principal
└── config/
    └── index.js                   # Variables entorno
```

---

## 🚀 Deploy

```bash
git push origin main
# Railway auto-deploy (~2-3 min)
```

---

## 🧪 Testing

### **Test básico:**
```
Input: "Hola, quiero más información"
Esperado: Respuesta natural preguntando por tienda/negocio
NO esperado: Asumir frustraciones, ofrecer reunión inmediato
```

### **Test flujo completo:**
```
1. "Hola" → Pregunta inicial
2. "Tengo tienda Shopify" → Pregunta qué vende
3. "Vendo ropa" → Pregunta cómo le va
4. "Mal, no vendo" → Ofrece reunión
5. "Dale" → Envía link
```

### **Test descalificación:**
```
Input: "Uso WooCommerce"
Esperado: "Datapify funciona solo con Shopify. Si migras, conversamos :)"
```

---

## 📈 KPIs a Monitorear

1. **Tasa de conversión a reunión agendada**
2. **Longitud promedio de respuestas** (esperado: 150-250 chars)
3. **% de conversaciones que completan flujo**
4. **Falsos positivos en detección de dolor**
5. **Tiempo promedio hasta agendar**

---

## 🎓 Lecciones Aprendidas

### **❌ Lo que NO funcionó:**
1. Scripts detallados con frases exactas
2. 50+ reglas simultáneas
3. Validación demasiado estricta
4. Instrucciones por fase muy largas
5. Intentar controlar cada palabra del LLM

### **✅ Lo que SÍ funciona:**
1. Contexto simple: "Sabes X, falta Y"
2. 6 principios claros en vez de 50 reglas
3. Validación básica + warnings
4. Instrucciones minimalistas
5. Confiar en la inteligencia del LLM

---

## 🔮 Próximos Pasos (Futuro)

1. **A/B Testing:** Comparar tasa de conversión vs versión anterior
2. **Análisis de sentimiento:** Mejorar detección de dolor
3. **Personalización:** Adaptar tono según lead (formal vs casual)
4. **Follow-up:** Sistema de recordatorios post-agendamiento
5. **Aprendizaje:** Analizar conversaciones exitosas vs fallidas

---

**Mantener simple. Confiar en el LLM. Dejar fluir natural.**

---

Última actualización: 2025-11-14
Commit: `2e805fd` - "SIMPLIFICACIÓN RADICAL"
