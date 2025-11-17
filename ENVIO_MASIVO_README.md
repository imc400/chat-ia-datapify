# 📤 Sistema de Envío Masivo de Mensajes

## ✅ ¿Qué se implementó?

Se agregó un sistema completo de envío masivo de mensajes por WhatsApp desde el dashboard, con las siguientes características:

### **Backend** ✅
- ✅ **Endpoint POST `/api/dashboard/send-message`**: Envía mensajes a múltiples números
- ✅ **Endpoint POST `/api/dashboard/preview-recipients`**: Preview de destinatarios según filtros
- ✅ **Rate limiting automático**: 1 mensaje por segundo para no saturar WhatsApp API
- ✅ **Guardado en BD**: Cada mensaje se guarda como `role: 'assistant'` para que la IA lo vea en el historial
- ✅ **Validaciones**: Longitud máxima 1000 caracteres, números válidos, etc.

### **Frontend** ✅
- ✅ **Botón "📤 Enviar Mensaje Masivo"** en la página de Leads
- ✅ **Modal inteligente** con:
  - Textarea para escribir el mensaje (max 1000 caracteres)
  - Contador de caracteres con warnings
  - **Filtros avanzados**:
    - Shopify (Sí/No/Todos)
    - Agendamiento (Agendaron/No agendaron/Todos)
    - Estado de conversión (Trial, Pagando, Sin conversión, etc.)
    - Temperatura del lead (Hot/Warm/Cold)
  - **Preview de destinatarios** con checkboxes individuales
  - Botones "Seleccionar todos" / "Deseleccionar todos"
  - **Confirmación** antes de enviar con lista de números
  - Indicador de progreso mientras envía
  - Resumen de éxito/fallos al finalizar

---

## 🚀 Cómo usar

### **1. Acceder a la funcionalidad**
1. Ve al dashboard: `http://localhost:3000/dashboard`
2. Navega a la sección **"Leads"**
3. Haz clic en el botón **"📤 Enviar Mensaje Masivo"**

### **2. Escribir el mensaje**
- Escribe tu mensaje en el textarea
- El contador te mostrará cuántos caracteres llevas (máx. 1000)
- Los saltos de línea se respetan tal cual los escribas

### **3. Filtrar destinatarios**
Configura los filtros según tu objetivo:

**Ejemplo 1: Leads con Shopify que NO agendaron**
- Shopify: `Solo con Shopify`
- Agendamiento: `No agendaron` ✅
- Estado de conversión: `Sin conversión`
- Temperatura: `Todas`

**Ejemplo 2: Solo tu número (para testing)**
- Ajusta los filtros hasta que solo aparezca tu número
- O simplemente desmarca todos los checkboxes excepto el tuyo

**Ejemplo 3: Hot leads sin conversión**
- Shopify: `Solo con Shopify`
- Agendamiento: `No agendaron`
- Estado de conversión: `Sin conversión`
- Temperatura: `Hot (🔥)`

### **4. Seleccionar destinatarios**
- Los destinatarios aparecen con su información (nombre, badges de Shopify, agendamiento, etc.)
- Por defecto, NINGUNO está seleccionado (para evitar envíos accidentales)
- Puedes:
  - ✅ Marcar/desmarcar individualmente cada checkbox
  - ✅ Usar "Seleccionar todos" para marcar todos los filtrados
  - ✅ Usar "Deseleccionar todos" para limpiar la selección

### **5. Enviar**
1. Haz clic en **"Enviar Mensaje"**
2. Confirma en el popup (te muestra hasta 5 números + contador total)
3. El sistema enviará los mensajes con rate limiting (1/seg)
4. Verás un resumen de éxito/fallos
5. El modal se cierra automáticamente después de 3 segundos

---

## 🧠 ¿Cómo funciona la IA después del envío?

### **Flujo completo:**

```
1. Tú envías mensaje manual: "Hola Juan, ¿seguiste interesado en mejorar tus ventas?"
   ↓
2. Sistema guarda en BD como role: 'assistant'
   ↓
3. Usuario responde: "Sí, ahora tengo tiempo"
   ↓
4. Webhook recibe el mensaje
   ↓
5. Sistema recupera TODO el historial (últimos 10 mensajes)
   incluyendo tu mensaje manual
   ↓
6. memoryService analiza TODO el contexto:
   - Plataforma: Shopify
   - Pain points detectados previamente
   - Último mensaje fue manual
   ↓
7. IA genera respuesta CON CONTEXTO COMPLETO:
   "Dale Juan! Veo que tienes Shopify y las ventas han estado complicadas.
   ¿Te tinca agendar una llamada de 30 min para mostrarte cómo podemos ayudarte?"
```

### **Lo que la IA recuerda:**
✅ Todo el historial de mensajes previos
✅ Tu mensaje manual (lo ve en el historial)
✅ Plataforma del lead (Shopify, etc.)
✅ Pain points expresados
✅ Nivel de frustración
✅ Temperatura del lead
✅ Si agendó o no previamente

---

## 🔧 Testing

### **Opción 1: Envío a tu propio número**

1. Abre el modal de envío masivo
2. Aplica filtros hasta que solo aparezca tu número
3. Selecciona solo tu checkbox
4. Escribe: "Hola, este es un mensaje de prueba"
5. Envía

Deberías recibir el mensaje en WhatsApp y puedes responder para ver si la IA contesta.

### **Opción 2: Envío masivo real**

**Ejemplo práctico:**
```
Mensaje:
"Hola! Vi que tienes una tienda en Shopify 🛍️

Quería saber si te gustaría que te mostremos cómo otros e-commerce chilenos
están duplicando sus ventas con Meta Ads optimizados.

¿Te tinca una demo de 30 minutos? Es gratis y sin compromiso.

Saludos,
Equipo Datapify"

Filtros:
✅ Shopify: Solo con Shopify
✅ Agendamiento: No agendaron
✅ Estado: Sin conversión
❌ Temperatura: Todas

Resultado: Se envía a todos los leads con Shopify que NO agendaron
```

---

## 📊 Logs y Monitoreo

Todos los envíos se registran en:

1. **Consola del servidor**: Logs detallados con Winston
2. **Base de datos**: Cada mensaje se guarda en la tabla `Message`
3. **Google Calendar**: Si después agendan, se sincroniza automáticamente

Puedes verificar en los logs:
```bash
tail -f logs/combined.log | grep "📤 Iniciando envío masivo"
```

---

## ⚠️ Límites y Restricciones

- **Máximo 1000 caracteres** por mensaje
- **Rate limiting**: 1 mensaje por segundo (para no saturar WhatsApp API)
- **Validación**: No se pueden enviar mensajes vacíos
- **Confirmación obligatoria**: Siempre pide confirmación antes de enviar

---

## 🎯 Casos de Uso Recomendados

### **1. Follow-up de leads calientes**
```
Filtro: Shopify + No agendaron + Hot leads
Mensaje: "Hola [nombre], vi que estabas interesado pero no pudimos
coordinar. ¿Sigues disponible para una llamada rápida?"
```

### **2. Reactivación de leads fríos**
```
Filtro: Shopify + No agendaron + Última actividad > 7 días
Mensaje: "Hola! Te escribí hace unos días sobre optimizar tus Meta Ads.
¿Sigues buscando mejorar las ventas de tu tienda?"
```

### **3. Oferta especial**
```
Filtro: Shopify + Sin conversión
Mensaje: "🎉 Promoción especial: 14 días de prueba GRATIS de Datapify.
¿Te gustaría probarlo sin compromiso?"
```

---

## 🔐 Seguridad

- ✅ **Validación de números**: Solo se envían a números válidos en la BD
- ✅ **Confirmación obligatoria**: Siempre pide confirmar antes de enviar
- ✅ **Rate limiting**: Protege contra saturación de la API
- ✅ **Logs completos**: Registra todos los envíos para auditoría
- ✅ **Guardado en BD**: Mantiene historial para que la IA tenga contexto

---

## 🐛 Troubleshooting

### **Error: "No se encontraron destinatarios"**
- Verifica que los filtros no sean demasiado restrictivos
- Revisa que tengas leads en la base de datos con esos criterios

### **Error al enviar**
- Verifica las credenciales de WhatsApp en `.env`
- Revisa los logs: `tail -f logs/error.log`
- Asegúrate de que el servidor esté corriendo

### **La IA no responde después del envío**
- Verifica que el webhook de WhatsApp esté configurado correctamente
- Revisa que el número esté en formato correcto (con código de país)

---

## ✨ Próximas Mejoras (Opcionales)

- [ ] Programar envíos para una fecha/hora específica
- [ ] Templates de mensajes guardados
- [ ] Variables dinámicas ({nombre}, {negocio}, etc.)
- [ ] Historial de envíos masivos
- [ ] A/B testing de mensajes
- [ ] Exportar resultados a CSV

---

**¡Listo para usar! 🚀**

Cualquier duda, revisa los logs o contacta al equipo técnico.
