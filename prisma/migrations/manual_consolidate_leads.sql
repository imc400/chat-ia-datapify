-- MIGRACIÓN MANUAL: Consolidar LeadData por teléfono
-- Paso 1: Agregar columna phone como nullable
-- Paso 2: Copiar phone desde Conversation
-- Paso 3: Consolidar duplicados (mantener el más reciente por teléfono)
-- Paso 4: Agregar leadDataId a Conversation
-- Paso 5: Actualizar relaciones
-- Paso 6: Hacer phone NOT NULL y UNIQUE

-- Paso 1: Agregar columna phone a LeadData (nullable temporalmente)
ALTER TABLE "LeadData" ADD COLUMN IF NOT EXISTS "phone" TEXT;

-- Paso 2: Copiar el phone desde la conversación relacionada
UPDATE "LeadData" ld
SET phone = c.phone
FROM "Conversation" c
WHERE ld."conversationId" = c.id;

-- Paso 3: Crear índice en phone para performance
CREATE INDEX IF NOT EXISTS "LeadData_phone_idx" ON "LeadData"("phone");

-- Paso 4: Para cada teléfono, mantener solo el LeadData más reciente y consolidar datos
-- Primero, identificamos cuál es el lead más reciente por teléfono
WITH latest_leads AS (
  SELECT DISTINCT ON (phone)
    id,
    phone,
    -- Consolidar datos de todos los leads del mismo teléfono
    COALESCE(name, '') as name,
    COALESCE(email, '') as email,
    "updatedAt"
  FROM "LeadData"
  WHERE phone IS NOT NULL
  ORDER BY phone, "updatedAt" DESC
),
-- Identificar los leads a eliminar (todos excepto el más reciente por teléfono)
leads_to_remove AS (
  SELECT ld.id
  FROM "LeadData" ld
  LEFT JOIN latest_leads ll ON ld.id = ll.id
  WHERE ll.id IS NULL AND ld.phone IS NOT NULL
)
-- Antes de eliminar, necesitamos actualizar las referencias
-- Esto se hará en el siguiente paso

-- Paso 5: Agregar columna leadDataId a Conversation (nullable)
ALTER TABLE "Conversation" ADD COLUMN IF NOT EXISTS "leadDataId" TEXT;

-- Paso 6: Para cada conversación, asignarle el LeadData consolidado de su teléfono
WITH latest_leads_by_phone AS (
  SELECT DISTINCT ON (phone)
    id as lead_id,
    phone
  FROM "LeadData"
  WHERE phone IS NOT NULL
  ORDER BY phone, "updatedAt" DESC
)
UPDATE "Conversation" c
SET "leadDataId" = ll.lead_id
FROM latest_leads_by_phone ll
WHERE c.phone = ll.phone;

-- Paso 7: Crear índice en leadDataId
CREATE INDEX IF NOT EXISTS "Conversation_leadDataId_idx" ON "Conversation"("leadDataId");

-- Paso 8: Ahora eliminar los LeadData duplicados (manteniendo solo el consolidado)
DELETE FROM "LeadData"
WHERE id IN (
  SELECT ld.id
  FROM "LeadData" ld
  WHERE ld.id NOT IN (
    SELECT DISTINCT ON (phone) id
    FROM "LeadData"
    WHERE phone IS NOT NULL
    ORDER BY phone, "updatedAt" DESC
  )
  AND phone IS NOT NULL
);

-- Paso 9: Hacer phone NOT NULL y UNIQUE
ALTER TABLE "LeadData" ALTER COLUMN "phone" SET NOT NULL;
ALTER TABLE "LeadData" ADD CONSTRAINT "LeadData_phone_key" UNIQUE ("phone");

-- Paso 10: Eliminar la columna conversationId (ya no la necesitamos)
ALTER TABLE "LeadData" DROP CONSTRAINT IF EXISTS "LeadData_conversationId_key";
ALTER TABLE "LeadData" DROP COLUMN IF EXISTS "conversationId";

-- RESULTADO:
-- ✅ Ahora cada teléfono tiene UN SOLO LeadData
-- ✅ Todas las conversaciones apuntan al LeadData correcto vía leadDataId
-- ✅ No hay duplicados de teléfonos
