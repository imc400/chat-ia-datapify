# Ejemplos de Conversación

Este documento muestra ejemplos de cómo interactuar con el bot y qué tipo de respuestas esperar.

## Flujo 1: Agendamiento Completo

```
Usuario: Hola, necesito agendar una reunión

Bot: ¡Hola! Con gusto te ayudo a agendar una reunión.
     ¿Cuál es tu nombre y para cuándo te gustaría la reunión?

Usuario: Soy María García y necesito una reunión para mañana a las 2 PM
     para hablar sobre servicios de consultoría

Bot: Perfecto, María. Déjame verificar la disponibilidad...

Bot: ✅ Reunión agendada con éxito para [fecha] a las 14:00.
     Motivo: Consultoría
     Te esperamos, María.

     🔗 Link del evento: [enlace a Google Calendar]
```

## Flujo 2: Horario No Disponible

```
Usuario: Quiero agendar para mañana a las 3 PM

Bot: Lo siento, ya existe una reunión agendada en ese horario.
     ¿Te gustaría ver otros horarios disponibles?

     [Ver horarios] [Proponer otro]

Usuario: [Presiona "Ver horarios"]

Bot: Aquí están los horarios disponibles:

     📅 Lunes, 13 de enero
     - 10:00 AM (Disponible)
     - 11:00 AM (Disponible)
     - 4:00 PM (Disponible)

     📅 Martes, 14 de enero
     - 9:00 AM (Disponible)
     - 2:00 PM (Disponible)
```

## Flujo 3: Información Incompleta

```
Usuario: Quiero agendar una reunión

Bot: Claro, estaré encantado de ayudarte.
     ¿Cuál es tu nombre y para cuándo te gustaría la reunión?

Usuario: Soy Carlos

Bot: Mucho gusto, Carlos. ¿Para qué fecha y hora prefieres la reunión?

Usuario: Mañana

Bot: Perfecto. ¿A qué hora te gustaría? Nuestro horario es de 9:00 AM a 6:00 PM.

Usuario: A las 10

Bot: Excelente. ¿Cuál es el motivo de la reunión?

Usuario: Quiero información sobre marketing digital

Bot: Perfecto, Carlos. Déjame agendar tu reunión...
     ✅ Reunión agendada exitosamente...
```

## Flujo 4: Horario Fuera de Rango

```
Usuario: Necesito una reunión para el sábado

Bot: Lo siento, solo agendamos reuniones de lunes a viernes.
     ¿Te gustaría elegir otro día?

Usuario: Entonces el lunes a las 8 AM

Bot: El horario debe estar entre 9:00 y 18:00.
     ¿Podrías elegir otra hora dentro de nuestro horario de atención?
```

## Flujo 5: Consulta General

```
Usuario: ¿Qué servicios ofrecen?

Bot: En Datapify ofrecemos servicios de:
     - Marketing Digital
     - Análisis de Datos
     - Automatización de Procesos
     - Consultoría Estratégica

     ¿Te gustaría agendar una reunión para conocer más sobre algún servicio?

Usuario: Sí, cuéntame más sobre automatización

Bot: La automatización de procesos te permite optimizar tareas repetitivas
     y mejorar la eficiencia. ¿Te gustaría agendar una consulta gratuita
     para ver cómo podemos ayudarte?
```

## Flujo 6: Cancelación

```
Usuario: Necesito cancelar mi reunión

Bot: Entiendo. ¿Me podrías proporcionar tu nombre y la fecha de la reunión
     que deseas cancelar?

Usuario: Soy Juan Pérez, la reunión es mañana a las 3 PM

Bot: [Buscando tu reunión...]

Bot: He encontrado tu reunión:
     - Fecha: [fecha]
     - Hora: 15:00
     - Motivo: [motivo]

     ¿Confirmas que deseas cancelarla?

Usuario: Sí

Bot: ✅ Tu reunión ha sido cancelada exitosamente.
     ¿Te gustaría reagendar para otra fecha?
```

## Flujo 7: Múltiples Intentos

```
Usuario: Reunión para hoy

Bot: Hoy ya no hay horarios disponibles. ¿Te gustaría ver disponibilidad
     para mañana?

Usuario: Bueno, para mañana

Bot: ¿A qué hora prefieres? Tengo disponible:
     - 10:00 AM
     - 2:00 PM
     - 5:00 PM

Usuario: 2 PM

Bot: Perfecto. ¿Cuál es tu nombre y el motivo de la reunión?
```

## Patrones Reconocidos

El bot puede reconocer diferentes formas de expresar la misma intención:

### Agendar
- "Quiero agendar una reunión"
- "Necesito una cita"
- "Quisiera hablar con alguien"
- "Cuándo tienen disponible"
- "Puedo agendar para mañana?"

### Fechas
- "Mañana"
- "Pasado mañana"
- "El lunes"
- "15 de enero"
- "2025-01-15"

### Horas
- "10 AM"
- "2:30 PM"
- "A las 14:00"
- "Por la mañana"
- "En la tarde"

### Motivos Comunes
- "Consulta"
- "Asesoría"
- "Información sobre servicios"
- "Cotización"
- "Demo del producto"

## Respuestas Especiales

### Saludo Inicial
```
Usuario: Hola

Bot: ¡Hola! Soy el asistente virtual de Datapify.
     ¿En qué puedo ayudarte hoy?
```

### Agradecimiento
```
Usuario: Gracias

Bot: ¡Con gusto! Si necesitas algo más, no dudes en escribirme.
```

### Despedida
```
Usuario: Adiós

Bot: ¡Hasta pronto! Que tengas un excelente día.
```

## Manejo de Errores

### Error del Sistema
```
Bot: Lo siento, ocurrió un error procesando tu mensaje.
     Por favor intenta nuevamente.
```

### Tipo de Mensaje No Soportado
```
Bot: Por el momento solo puedo procesar mensajes de texto.
     ¿En qué puedo ayudarte?
```

### Calendario No Disponible
```
Bot: Lo siento, no pude verificar la disponibilidad en el calendario.
     Por favor intenta nuevamente en unos momentos.
```

## Tips para Usuarios

1. **Sé específico**: Proporciona toda la información en un mensaje para agilizar el proceso
   ```
   ❌ "Quiero una reunión"
   ✅ "Soy Ana López, quiero agendar una reunión mañana a las 10 AM para hablar sobre marketing"
   ```

2. **Usa formatos claros**: Fechas y horas en formato estándar
   ```
   ✅ "Mañana a las 2 PM"
   ✅ "15 de enero a las 14:00"
   ✅ "2025-01-15 10:00"
   ```

3. **Confirma tu información**: Verifica que los datos sean correctos antes de confirmar

4. **Guarda el link**: El bot enviará un link de Google Calendar, guárdalo para tener todos los detalles

## Personalización

Para personalizar las respuestas del bot, edita el `systemPrompt` en:
`src/services/geminiService.js`

Puedes ajustar:
- Tono de las respuestas (formal/informal)
- Información sobre servicios
- Horarios y disponibilidad
- Mensajes de confirmación
