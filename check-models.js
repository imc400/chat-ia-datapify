require('dotenv').config();
const { GoogleGenerativeAI } = require('@google/generative-ai');

async function checkModels() {
  console.log('\n===========================================');
  console.log('VERIFICANDO API KEY Y MODELOS DISPONIBLES');
  console.log('===========================================\n');

  const apiKey = process.env.GEMINI_API_KEY;
  console.log('API Key:', apiKey.substring(0, 20) + '...');

  try {
    const genAI = new GoogleGenerativeAI(apiKey);

    // Probar con diferentes nombres de modelo
    const modelsToTry = [
      'gemini-pro',
      'gemini-1.5-pro',
      'gemini-1.5-flash',
      'gemini-1.5-flash-latest',
      'models/gemini-pro',
      'models/gemini-1.5-flash'
    ];

    console.log('\nProbando modelos...\n');

    for (const modelName of modelsToTry) {
      try {
        console.log(`Probando: ${modelName}...`);
        const model = genAI.getGenerativeModel({ model: modelName });
        const result = await model.generateContent('Di "OK"');
        const response = await result.response;
        const text = response.text();
        console.log(`  ✅ ${modelName} funciona! Respuesta: ${text.substring(0, 20)}...\n`);

        console.log('===========================================');
        console.log(`✅ MODELO FUNCIONAL: ${modelName}`);
        console.log('===========================================\n');
        console.log(`Actualiza tu .env con:\nGEMINI_MODEL=${modelName}\n`);
        return;
      } catch (error) {
        console.log(`  ❌ ${modelName} no funciona`);
      }
    }

    console.log('\n❌ Ningún modelo funcionó. Verifica tu API key.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.log('\nVerifica que:');
    console.log('1. La API key sea correcta');
    console.log('2. Tengas conexión a internet');
    console.log('3. La API key tenga permisos para Gemini\n');
  }
}

checkModels();
