# Guía Completa: Configurar WhatsApp Business API

Esta guía te llevará paso a paso para conectar tu agente IA con WhatsApp Business y recibir mensajes de tus campañas de Meta Ads.

---

## 📋 Requisitos Previos

- ✅ Cuenta de Facebook (personal)
- ✅ Número de teléfono que NO esté registrado en WhatsApp (será el número del bot)
- ✅ Tarjeta de crédito/débito (para verificación, pero es GRATIS hasta 1,000 conversaciones/mes)

---

## PARTE 1: Crear App en Meta for Developers

### Paso 1: Ve a Meta for Developers

Abre en tu navegador: **https://developers.facebook.com/apps**

### Paso 2: Crear Nueva App

1. Haz clic en **"Crear app"** (botón verde arriba a la derecha)
2. Selecciona tipo de app: **"Empresa"** o **"Business"**
3. Haz clic en **"Siguiente"**

### Paso 3: Detalles de la App

Llena el formulario:
- **Nombre para mostrar de la app:** `Datapify Bot` (o el nombre que quieras)
- **Correo de contacto de la app:** Tu email
- **Cuenta empresarial:** Selecciona una o crea una nueva
- Haz clic en **"Crear app"**

### Paso 4: Verificación

- Si te pide verificar tu identidad, sigue los pasos
- Puede pedirte contraseña de Facebook

✅ **Checkpoint:** Ya tienes tu app creada

---

## PARTE 2: Configurar WhatsApp

### Paso 5: Agregar Producto WhatsApp

1. En el panel de tu app, busca la sección **"Agregar productos"**
2. Encuentra **"WhatsApp"** y haz clic en **"Configurar"**
3. Te llevará al panel de configuración de WhatsApp

### Paso 6: Inicio Rápido (Quick Start)

Verás una pantalla de "Inicio rápido" con 5 pasos:

#### 6.1 - Seleccionar cuenta de WhatsApp Business
- Si no tienes una, haz clic en **"Crear una cuenta de WhatsApp Business"**
- Nombre: `Datapify` (o tu nombre de negocio)
- Haz clic en **"Continuar"**

#### 6.2 - Agregar número de teléfono
**IMPORTANTE:** Este número será el del bot y NO puede estar registrado en WhatsApp

- Haz clic en **"Agregar número de teléfono"**
- Selecciona país: **Chile (+56)**
- Ingresa un número que **NO esté en WhatsApp**
  - Puede ser un número nuevo
  - Puede ser un número fijo
  - Puede ser un número que nunca hayas usado en WhatsApp
- Haz clic en **"Siguiente"**

#### 6.3 - Verificar número
- Recibirás un código SMS o llamada
- Ingresa el código de verificación
- Haz clic en **"Verificar"**

✅ **Checkpoint:** Tu número está verificado y activo

---

## PARTE 3: Obtener Credenciales

### Paso 7: Obtener Phone Number ID

En el panel de WhatsApp, verás:

**"Número de teléfono"** con un ID largo debajo

Ejemplo:
```
Número de teléfono
+56912345678
123456789012345  ← Este es el PHONE_NUMBER_ID
```

📝 **Copia este número** (los números largos, no el +56...)

### Paso 8: Obtener Access Token (Temporal)

En la misma página verás:

**"Token de acceso temporal"**

```
[Un texto muy largo que empieza con EAAxxxxx...]
[Botón: Copiar]
```

📝 **Copia este token**

⚠️ **IMPORTANTE:** Este token es TEMPORAL (24 horas). Después necesitaremos crear uno permanente.

### Paso 9: Obtener Verify Token

Este lo defines tú. Puede ser cualquier texto, por ejemplo:
```
datapify_verify_2025
```

📝 **Guarda este texto** (lo usaremos para el webhook)

---

## PARTE 4: Exponer tu Servidor Localmente

Como estás en desarrollo, necesitas exponer tu servidor local a internet para que WhatsApp pueda enviar mensajes.

### Paso 10: Instalar ngrok

**Opción A: Con Homebrew (recomendado en Mac)**
```bash
brew install ngrok
```

**Opción B: Descargar manualmente**
- Ve a: https://ngrok.com/download
- Descarga la versión para Mac
- Descomprime y mueve a `/usr/local/bin/`

### Paso 11: Registrarse en ngrok (Gratis)

1. Ve a: https://dashboard.ngrok.com/signup
2. Regístrate (es gratis)
3. Ve a: https://dashboard.ngrok.com/get-started/your-authtoken
4. Copia tu authtoken

Configura ngrok:
```bash
ngrok config add-authtoken TU_AUTHTOKEN_AQUI
```

### Paso 12: Iniciar tu Servidor

En una terminal:
```bash
cd "/Users/ignacioblanco/Desktop/Chat IA Datapify"
npm start
```

Deberías ver:
```
🚀 Servidor iniciado en puerto 3000
📱 Webhook disponible en: http://localhost:3000/webhook
```

**⚠️ NO CIERRES ESTA TERMINAL**

### Paso 13: Exponer con ngrok

En **OTRA terminal nueva**:
```bash
ngrok http 3000
```

Verás algo como:
```
Forwarding   https://abc123xyz.ngrok-free.app -> http://localhost:3000
```

📝 **Copia la URL de "Forwarding"** (la que empieza con https://)

Ejemplo: `https://abc123xyz.ngrok-free.app`

**⚠️ NO CIERRES ESTA TERMINAL TAMPOCO**

---

## PARTE 5: Configurar Webhook en Meta

### Paso 14: Configurar URL del Webhook

1. Vuelve al panel de Meta for Developers
2. En el menú izquierdo, ve a **"WhatsApp" > "Configuración"**
3. Busca la sección **"Webhook"**
4. Haz clic en **"Configurar"** o **"Editar"**

Llena el formulario:

**URL de devolución de llamada (Callback URL):**
```
https://TU-URL-DE-NGROK.ngrok-free.app/webhook
```
(Reemplaza con tu URL de ngrok + `/webhook`)

**Token de verificación (Verify Token):**
```
datapify_verify_2025
```
(El que definiste en el Paso 9)

5. Haz clic en **"Verificar y guardar"**

✅ Si todo está bien, verás: **"Webhook verificado correctamente"**

❌ Si da error, verifica que:
- Tu servidor esté corriendo (`npm start`)
- ngrok esté corriendo
- La URL sea correcta (con /webhook al final)
- El verify token coincida

### Paso 15: Suscribirse a Eventos

Después de verificar, verás **"Campos de Webhooks"**

Activa estos campos:
- ✅ **messages** (OBLIGATORIO)
- ✅ **message_status** (opcional, para ver estados)

Haz clic en **"Guardar"**

---

## PARTE 6: Configurar el Proyecto

### Paso 16: Actualizar .env

Abre el archivo `.env`:
```bash
cd "/Users/ignacioblanco/Desktop/Chat IA Datapify"
nano .env
```

Actualiza estas líneas con TUS datos:

```bash
# =================================
# WHATSAPP CLOUD API
# =================================
WHATSAPP_PHONE_NUMBER_ID=123456789012345
WHATSAPP_ACCESS_TOKEN=EAAxxxxxxxxxxxxxxxxxxxxxx
WHATSAPP_VERIFY_TOKEN=datapify_verify_2025
WHATSAPP_API_VERSION=v18.0
```

Guarda con `Ctrl + O`, Enter, y sal con `Ctrl + X`

### Paso 17: Reiniciar Servidor

En la terminal donde corre el servidor:
- Presiona `Ctrl + C` para detener
- Vuelve a iniciar:
```bash
npm start
```

---

## PARTE 7: Probar que Funciona

### Paso 18: Enviar Mensaje de Prueba desde Meta

1. En el panel de WhatsApp de Meta for Developers
2. Busca la sección **"Enviar y recibir mensajes"**
3. Verás una opción para **"Enviar mensaje de prueba"**
4. Ingresa TU número de WhatsApp personal
5. Haz clic en **"Enviar mensaje"**

Deberías recibir un mensaje en tu WhatsApp personal.

### Paso 19: Responder al Mensaje

Desde tu WhatsApp personal, **responde** al mensaje que recibiste.

Escribe: **"Hola"**

### Paso 20: Ver en los Logs

En la terminal donde corre tu servidor, deberías ver:

```
📩 Mensaje recibido { from: '56912345678', type: 'text', messageId: '...' }
💬 Procesando mensaje { from: '56912345678', message: 'Hola' }
📊 Lead actualizado { temperature: 'cold', score: 0, phase: 'APERTURA' }
✅ Respuesta generada por Gemini
```

Y en tu WhatsApp deberías recibir:

```
¡Hola! 👋 Oye, ¿tu sitio web está en Shopify?
```

🎉 **¡FUNCIONA!**

---

## PARTE 8: Crear Token Permanente (IMPORTANTE)

El token temporal expira en 24 horas. Necesitas uno permanente.

### Paso 21: Generar Token Permanente

1. En el panel de Meta, ve a **"Configuración" > "Básica"** (menú izquierdo)
2. Busca **"Tokens de acceso"** o **"Access Tokens"**
3. Haz clic en **"Generar token"**
4. Selecciona los permisos:
   - ✅ `whatsapp_business_messaging`
   - ✅ `whatsapp_business_management`
5. Selecciona duración: **"60 días"** o **"Nunca expira"**
6. Haz clic en **"Generar token"**
7. 📝 **COPIA EL TOKEN** (guárdalo en un lugar seguro)

### Paso 22: Actualizar .env con Token Permanente

```bash
nano .env
```

Reemplaza el token temporal por el permanente:
```bash
WHATSAPP_ACCESS_TOKEN=TU_NUEVO_TOKEN_PERMANENTE
```

Guarda y reinicia el servidor.

---

## PARTE 9: Conectar con Campañas de Meta Ads

### Paso 23: Configurar Botón de WhatsApp en Anuncios

1. Ve a **Meta Business Suite**: https://business.facebook.com
2. Crea una campaña nueva o edita una existente
3. En **"Objetivo"**: Selecciona **"Mensajes"**
4. En **"Destino del mensaje"**: Selecciona **"WhatsApp"**
5. Selecciona tu número de WhatsApp Business
6. Configura tu anuncio (imagen, texto, etc.)
7. Publica

### Paso 24: Probar el Flujo Completo

1. Ve a tu anuncio publicado
2. Haz clic en el botón de WhatsApp desde otro dispositivo
3. Envía un mensaje
4. El agente IA debería responder automáticamente

---

## 🎉 ¡LISTO!

Tu agente IA ya está conectado con WhatsApp y listo para:

✅ Recibir mensajes de campañas de Meta Ads
✅ Conversar con método socrático
✅ Calificar leads automáticamente
✅ Agendar reuniones

---

## 🔧 Solución de Problemas

### El webhook no se verifica
- ✅ Verifica que el servidor esté corriendo
- ✅ Verifica que ngrok esté corriendo
- ✅ Verifica que el VERIFY_TOKEN coincida en .env y Meta
- ✅ Revisa los logs del servidor

### No recibo respuestas del bot
- ✅ Verifica que el PHONE_NUMBER_ID sea correcto
- ✅ Verifica que el ACCESS_TOKEN sea válido
- ✅ Revisa los logs del servidor
- ✅ Verifica que Gemini esté configurado

### El token expiró
- ✅ Genera un token permanente (Paso 21)
- ✅ Actualiza el .env
- ✅ Reinicia el servidor

---

## 📱 Para Producción

Cuando quieras pasar a producción:

1. **Servidor permanente** (no ngrok):
   - Usa un servidor con IP fija (AWS, DigitalOcean, etc.)
   - Configura un dominio con HTTPS
   - Actualiza el webhook en Meta con tu dominio real

2. **Verificación de negocio**:
   - Meta te pedirá verificar tu negocio
   - Sigue el proceso en Meta Business Suite

3. **Límites de mensajes**:
   - Gratis: 1,000 conversaciones/mes
   - Después: ~$0.03-0.05 USD por conversación

---

## 🆘 ¿Necesitas Ayuda?

Si tienes problemas en algún paso, comparte:
1. En qué paso estás
2. Qué error ves
3. Los logs del servidor

¡Estoy aquí para ayudarte! 🚀
