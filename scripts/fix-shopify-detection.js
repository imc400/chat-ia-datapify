/**
 * SCRIPT DE MIGRACIÓN: Corregir detección de Shopify en leads históricos
 *
 * Este script re-procesa TODAS las conversaciones que mencionan "shopify"
 * y actualiza el LeadData correctamente usando la lógica mejorada.
 *
 * Uso: node scripts/fix-shopify-detection.js
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Copiar la lógica de normalización y detección del messageController
const normalizeText = (text) => {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Eliminar tildes
    .trim();
};

const detectShopify = (userText) => {
  const normalizedText = normalizeText(userText);
  const words = normalizedText.split(/\s+/);

  // Verificar plataformas competidoras
  const otherPlatforms = [
    'woocommerce',
    'woo commerce',
    'magento',
    'prestashop',
    'vtex',
    'jumpseller',
    'tienda nube',
    'mercado shops',
    'mercadoshops',
    'wordpress',
  ];

  const hasOtherPlatform = otherPlatforms.some(platform =>
    normalizedText.includes(platform)
  );

  if (hasOtherPlatform) {
    return { hasShopify: false, method: 'plataforma_competidora' };
  }

  // Detección de Shopify
  if (normalizedText.includes('shopify')) {
    // Estrategia 1: Palabra única
    if (words.length === 1 && words[0] === 'shopify') {
      return { hasShopify: true, method: 'palabra_unica' };
    }
    // Estrategia 2: Respuesta corta
    else if (words.length <= 5 && words.includes('shopify')) {
      return { hasShopify: true, method: 'respuesta_corta' };
    }
    // Estrategia 3: Frases confirmativas
    else if (
      normalizedText.includes('tengo shopify') ||
      normalizedText.includes('uso shopify') ||
      normalizedText.includes('con shopify') ||
      normalizedText.includes('en shopify') ||
      normalizedText.includes('mi shopify') ||
      normalizedText.includes('tienda shopify') ||
      normalizedText.includes('tienda en shopify') ||
      normalizedText.includes('tienda es shopify') ||
      normalizedText.match(/\bsi\b.*shopify/i) ||
      normalizedText.match(/shopify.*\bsi\b/i) ||
      normalizedText.includes('esta en shopify') ||
      normalizedText.includes('esta con shopify')
    ) {
      return { hasShopify: true, method: 'frase_confirmativa' };
    }
    // Estrategia 4: Mención sin negación
    else if (
      normalizedText.includes('shopify') &&
      !normalizedText.includes('no uso') &&
      !normalizedText.includes('no tengo') &&
      !normalizedText.includes('no es') &&
      !normalizedText.includes('sin shopify') &&
      !normalizedText.includes('no shopify') &&
      words.length <= 15
    ) {
      return { hasShopify: true, method: 'mencion_sin_negacion' };
    }
  }

  return { hasShopify: null, method: 'no_detectado' };
};

async function main() {
  console.log('🔍 Iniciando análisis de leads históricos...\n');

  // Buscar todos los mensajes de usuario que mencionan shopify
  const messages = await prisma.message.findMany({
    where: {
      role: 'user',
      content: {
        contains: 'shopify',
        mode: 'insensitive'
      }
    },
    include: {
      conversation: {
        include: {
          leadData: true
        }
      }
    },
    orderBy: { timestamp: 'desc' }
  });

  console.log(`📊 Total mensajes con "shopify": ${messages.length}\n`);

  let fixed = 0;
  let alreadyCorrect = 0;
  let skipped = 0;

  for (const msg of messages) {
    const phone = msg.conversation.phone;
    const currentHasShopify = msg.conversation.leadData?.hasShopify;
    const detection = detectShopify(msg.content);

    console.log('---');
    console.log(`Phone: ${phone}`);
    console.log(`Mensaje: "${msg.content.substring(0, 80)}..."`);
    console.log(`Estado actual: ${currentHasShopify === true ? '✅' : currentHasShopify === false ? '❌' : '⚠️  undefined'}`);
    console.log(`Detección nueva: ${detection.hasShopify === true ? '✅' : detection.hasShopify === false ? '❌' : '⚠️  no detectado'} (método: ${detection.method})`);

    // Si la detección es diferente del estado actual, actualizar
    if (detection.hasShopify !== null && detection.hasShopify !== currentHasShopify) {
      try {
        await prisma.leadData.upsert({
          where: { phone },
          update: {
            hasShopify: detection.hasShopify,
            updatedAt: new Date()
          },
          create: {
            phone,
            hasShopify: detection.hasShopify
          }
        });

        console.log(`✅ CORREGIDO: ${currentHasShopify} → ${detection.hasShopify}`);
        fixed++;
      } catch (error) {
        console.error(`❌ Error actualizando ${phone}:`, error.message);
        skipped++;
      }
    } else if (detection.hasShopify === currentHasShopify) {
      console.log('✓ Ya estaba correcto');
      alreadyCorrect++;
    } else {
      console.log('⚠️  No se detectó cambio necesario');
      skipped++;
    }

    console.log('');
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📈 RESUMEN DE MIGRACIÓN');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✅ Corregidos: ${fixed}`);
  console.log(`✓  Ya correctos: ${alreadyCorrect}`);
  console.log(`⚠️  Omitidos: ${skipped}`);
  console.log(`📊 Total procesados: ${messages.length}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main()
  .catch(e => {
    console.error('Error fatal:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
