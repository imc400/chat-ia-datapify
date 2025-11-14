/**
 * Script para probar el Agente IA de Datapify
 *
 * Este script simula una conversación con el agente para verificar que:
 * 1. La API de Gemini funciona correctamente
 * 2. El agente está entrenado con el conocimiento de Datapify
 * 3. Usa el método socrático correctamente
 */

require('dotenv').config();
const geminiService = require('./src/services/geminiService');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Simular una sesión de conversación
const conversationHistory = [];

console.log('\n===========================================');
console.log('PRUEBA DEL AGENTE IA - DATAPIFY');
console.log('===========================================\n');
console.log('El agente está entrenado con el método socrático.');
console.log('Escribe tus mensajes como si fueras un cliente.\n');
console.log('Comandos especiales:');
console.log('  - "salir" o "exit" para terminar');
console.log('  - "reset" para reiniciar conversación');
console.log('  - "historial" para ver el historial\n');
console.log('===========================================\n');

async function chat() {
  rl.question('Tú: ', async (userMessage) => {
    if (!userMessage.trim()) {
      return chat();
    }

    // Comandos especiales
    if (userMessage.toLowerCase() === 'salir' || userMessage.toLowerCase() === 'exit') {
      console.log('\n¡Hasta luego! 👋\n');
      rl.close();
      return;
    }

    if (userMessage.toLowerCase() === 'reset') {
      conversationHistory.length = 0;
      console.log('\n✅ Conversación reiniciada\n');
      return chat();
    }

    if (userMessage.toLowerCase() === 'historial') {
      console.log('\n--- HISTORIAL DE CONVERSACIÓN ---');
      conversationHistory.forEach((msg, i) => {
        console.log(`${i + 1}. ${msg.role}: ${msg.content}`);
      });
      console.log('--- FIN DEL HISTORIAL ---\n');
      return chat();
    }

    try {
      // Agregar mensaje del usuario al historial
      conversationHistory.push({
        role: 'usuario',
        content: userMessage
      });

      // Calificar el lead
      const leadScore = geminiService.qualifyLead(conversationHistory);

      console.log(`\n[📊 Lead: ${leadScore.temperature.toUpperCase()} | Score: ${leadScore.score}/10 | Fase: ${leadScore.phase}]`);

      // Generar respuesta con el agente
      const aiResponse = await geminiService.generateResponse(
        userMessage,
        conversationHistory.slice(-10), // Últimos 10 mensajes
        leadScore
      );

      // Verificar si hay intención de agendar
      const scheduleIntent = geminiService.parseScheduleIntent(aiResponse);
      const cleanResponse = geminiService.cleanResponse(aiResponse);

      // Agregar respuesta al historial
      conversationHistory.push({
        role: 'asistente',
        content: cleanResponse
      });

      // Mostrar respuesta
      console.log(`\nAgente IA: ${cleanResponse}`);

      // Si detectó intención de agendar
      if (scheduleIntent && scheduleIntent.isComplete) {
        console.log('\n[✅ INTENCIÓN DE AGENDAMIENTO DETECTADA]');
        console.log(`   Nombre: ${scheduleIntent.name}`);
        console.log(`   Motivo: ${scheduleIntent.reason}`);
        console.log(`   Fecha: ${scheduleIntent.date}`);
        console.log(`   Hora: ${scheduleIntent.time}`);
      }

      console.log('');

      // Continuar conversación
      chat();
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      console.log('\nVerifica que:');
      console.log('1. La API key de Gemini sea correcta');
      console.log('2. El archivo business-knowledge.json exista');
      console.log('3. Tengas conexión a internet\n');
      rl.close();
    }
  });
}

// Verificar que la API key esté configurada
if (!process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY.includes('tu_')) {
  console.log('❌ Error: API key de Gemini no configurada');
  console.log('\nConfigura GEMINI_API_KEY en el archivo .env\n');
  rl.close();
} else {
  console.log('Agente: Hola! Escribe tu primer mensaje para empezar...\n');
  chat();
}
