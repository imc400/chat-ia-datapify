/**
 * Script para probar la configuración de WhatsApp
 *
 * Uso: node test-whatsapp.js
 */

require('dotenv').config();
const axios = require('axios');

async function testWhatsApp() {
  console.log('\n===========================================');
  console.log('VERIFICACIÓN DE WHATSAPP BUSINESS API');
  console.log('===========================================\n');

  // Verificar variables de entorno
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;

  console.log('📋 Configuración actual:\n');
  console.log(`Phone Number ID: ${phoneNumberId?.substring(0, 20) || 'NO CONFIGURADO'}...`);
  console.log(`Access Token: ${accessToken?.substring(0, 20) || 'NO CONFIGURADO'}...`);
  console.log(`Verify Token: ${verifyToken || 'NO CONFIGURADO'}`);

  if (!phoneNumberId || phoneNumberId.includes('tu_')) {
    console.log('\n❌ WHATSAPP_PHONE_NUMBER_ID no está configurado');
    console.log('Sigue la GUIA_WHATSAPP.md para obtenerlo\n');
    return;
  }

  if (!accessToken || accessToken.includes('tu_')) {
    console.log('\n❌ WHATSAPP_ACCESS_TOKEN no está configurado');
    console.log('Sigue la GUIA_WHATSAPP.md para obtenerlo\n');
    return;
  }

  console.log('\n✓ Variables configuradas correctamente\n');

  // Test 1: Verificar que el Phone Number ID sea válido
  console.log('📱 Test 1: Verificando Phone Number ID...\n');

  try {
    const url = `https://graph.facebook.com/v18.0/${phoneNumberId}`;
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log('✅ Phone Number ID válido');
    console.log(`   Número verificado: ${response.data.display_phone_number || 'N/A'}`);
    console.log(`   Nombre: ${response.data.verified_name || 'N/A'}`);
    console.log(`   Código de país: ${response.data.code_verification_status || 'N/A'}\n`);

  } catch (error) {
    console.log('❌ Error al verificar Phone Number ID');
    console.log(`   ${error.response?.data?.error?.message || error.message}\n`);
    console.log('Verifica que:');
    console.log('1. El PHONE_NUMBER_ID sea correcto');
    console.log('2. El ACCESS_TOKEN tenga permisos de WhatsApp\n');
    return;
  }

  // Test 2: Intentar enviar un mensaje de prueba (a ti mismo)
  console.log('📤 Test 2: ¿Quieres enviar un mensaje de prueba?\n');
  console.log('Para enviar un mensaje de prueba, necesitas un número de WhatsApp válido.');
  console.log('Este debe ser TU número personal (con código de país, sin + ni espacios).');
  console.log('Ejemplo: 56912345678\n');

  const readline = require('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Ingresa tu número de WhatsApp (o "skip" para omitir): ', async (phoneNumber) => {
    if (phoneNumber.toLowerCase() === 'skip' || !phoneNumber.trim()) {
      console.log('\n✅ Test omitido\n');
      console.log('===========================================');
      console.log('CONFIGURACIÓN VERIFICADA CORRECTAMENTE');
      console.log('===========================================\n');
      console.log('Tu agente está listo para recibir mensajes de WhatsApp.\n');
      console.log('Próximos pasos:');
      console.log('1. Asegúrate de que el servidor esté corriendo: npm start');
      console.log('2. Expón con ngrok: ngrok http 3000');
      console.log('3. Configura el webhook en Meta for Developers');
      console.log('4. Envía un mensaje desde tu WhatsApp personal\n');
      rl.close();
      return;
    }

    // Limpiar el número
    const cleanNumber = phoneNumber.replace(/\D/g, '');

    try {
      const url = `https://graph.facebook.com/v18.0/${phoneNumberId}/messages`;
      const payload = {
        messaging_product: 'whatsapp',
        to: cleanNumber,
        type: 'text',
        text: {
          body: '✅ Test exitoso! Tu agente IA de Datapify está configurado correctamente. Responde "hola" para probar el método socrático.'
        }
      };

      await axios.post(url, payload, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      console.log('\n✅ Mensaje de prueba enviado exitosamente!');
      console.log(`   Revisa tu WhatsApp: +${cleanNumber}\n`);
      console.log('Si recibes el mensaje, significa que todo está configurado correctamente.\n');
      console.log('Para probar el agente completo:');
      console.log('1. Responde al mensaje que recibiste');
      console.log('2. El agente debería responderte automáticamente con el método socrático\n');

    } catch (error) {
      console.log('\n❌ Error al enviar mensaje de prueba');
      console.log(`   ${error.response?.data?.error?.message || error.message}\n`);

      if (error.response?.data?.error?.code === 131047) {
        console.log('⚠️  El número receptor no tiene WhatsApp o no está verificado en Meta.\n');
        console.log('Solución:');
        console.log('1. Ve a Meta for Developers > WhatsApp > Configuración');
        console.log('2. Busca "Números de teléfono de prueba"');
        console.log('3. Agrega tu número personal');
        console.log('4. Vuelve a intentar\n');
      }
    }

    console.log('===========================================');
    console.log('PRUEBA COMPLETADA');
    console.log('===========================================\n');
    rl.close();
  });
}

testWhatsApp();
