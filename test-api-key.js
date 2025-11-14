/**
 * Test directo de la API key de Gemini
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');

const API_KEY = 'AIzaSyAdhaUSGmqeSNhxf6PHbiUC6V74Iic4eBY';

async function testAPIKey() {
  console.log('\n===========================================');
  console.log('TEST DE API KEY DE GEMINI');
  console.log('===========================================\n');

  console.log('API Key:', API_KEY.substring(0, 25) + '...\n');

  try {
    const genAI = new GoogleGenerativeAI(API_KEY);

    // Lista de modelos a probar con la nueva librería
    const models = [
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
      'gemini-1.5-pro',
      'gemini-pro'
    ];

    console.log('Probando modelos disponibles...\n');

    for (const modelName of models) {
      try {
        console.log(`📝 Probando: ${modelName}`);
        const model = genAI.getGenerativeModel({ model: modelName });

        const result = await model.generateContent('Responde solo con la palabra "OK"');
        const response = await result.response;
        const text = response.text();

        console.log(`   ✅ FUNCIONA! Respuesta: "${text.trim()}"\n`);

        console.log('===========================================');
        console.log(`✅ MODELO FUNCIONAL ENCONTRADO`);
        console.log('===========================================');
        console.log(`\nModelo: ${modelName}`);
        console.log(`\nActualiza tu .env con:`);
        console.log(`GEMINI_MODEL=${modelName}\n`);

        return modelName;
      } catch (error) {
        console.log(`   ❌ No funciona: ${error.message.substring(0, 80)}...\n`);
      }
    }

    console.log('\n❌ Ningún modelo funcionó.\n');
    console.log('Posibles causas:');
    console.log('1. La API key no tiene acceso a Gemini');
    console.log('2. La API key está restringida');
    console.log('3. Problema de conexión\n');
    console.log('Genera una nueva API key en:');
    console.log('https://aistudio.google.com/app/apikey\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
  }
}

testAPIKey();
