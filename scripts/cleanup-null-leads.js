const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanupNullLeads() {
  console.log('🧹 Limpiando leads con phone NULL...\n');

  try {
    // Eliminar todos los leads que no tienen teléfono
    const result = await prisma.leadData.deleteMany({
      where: { phone: null },
    });

    console.log(`✅ Eliminados ${result.count} leads sin teléfono\n`);

    // Mostrar resumen final
    const totalLeads = await prisma.leadData.count();
    console.log(`📊 Total leads restantes: ${totalLeads}`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

cleanupNullLeads()
  .then(() => {
    console.log('\n✅ Limpieza completada');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error en limpieza:', error);
    process.exit(1);
  });
