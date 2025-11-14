/**
 * Test simple del Agente IA
 */

require('dotenv').config();
const geminiService = require('./src/services/geminiService');

async function testAgent() {
  console.log('\n===========================================');
  console.log('TEST DEL AGENTE IA - DATAPIFY');
  console.log('===========================================\n');

  try {
    // Test 1: Verificar que el knowledge base se cargó
    console.log('✓ Test 1: Knowledge Base');
    if (geminiService.businessKnowledge) {
      console.log(`  ✅ Knowledge base cargado`);
      console.log(`  Empresa: ${geminiService.businessKnowledge.company.name}`);
      console.log(`  Planes: ${geminiService.businessKnowledge.plans.length}`);
      console.log(`  FAQs: ${geminiService.businessKnowledge.faqs.length}`);
    } else {
      console.log(`  ❌ Knowledge base NO cargado`);
      return;
    }

    // Test 2: Simular conversación
    console.log('\n✓ Test 2: Conversación Simulada\n');

    const conversationHistory = [];

    // Mensaje 1
    console.log('👤 Usuario: Hola');
    conversationHistory.push({ role: 'usuario', content: 'Hola' });

    let leadScore = geminiService.qualifyLead(conversationHistory);
    console.log(`📊 Lead: ${leadScore.temperature} | Score: ${leadScore.score}/10`);

    let response = await geminiService.generateResponse('Hola', conversationHistory, leadScore);
    let cleanResponse = geminiService.cleanResponse(response);

    console.log(`🤖 Agente: ${cleanResponse}\n`);
    conversationHistory.push({ role: 'asistente', content: cleanResponse });

    // Mensaje 2
    console.log('👤 Usuario: Sí, tengo Shopify');
    conversationHistory.push({ role: 'usuario', content: 'Sí, tengo Shopify' });

    leadScore = geminiService.qualifyLead(conversationHistory);
    console.log(`📊 Lead: ${leadScore.temperature} | Score: ${leadScore.score}/10`);

    response = await geminiService.generateResponse('Sí, tengo Shopify', conversationHistory, leadScore);
    cleanResponse = geminiService.cleanResponse(response);

    console.log(`🤖 Agente: ${cleanResponse}\n`);

    console.log('===========================================');
    console.log('✅ PRUEBA EXITOSA');
    console.log('===========================================\n');
    console.log('El agente IA está funcionando correctamente!');
    console.log('\nPara probar conversaciones completas, ejecuta:');
    console.log('  node test-agent.js\n');

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    console.log('\nPosibles causas:');
    console.log('1. API key de Gemini inválida o expirada');
    console.log('2. No hay conexión a internet');
    console.log('3. Problema con el archivo business-knowledge.json\n');
  }
}

testAgent();
