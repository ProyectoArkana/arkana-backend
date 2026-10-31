-- ============================================================
-- Rareza de las cartas
-- Para bases de datos YA creadas. Es seguro ejecutarla más de una vez.
-- Aplicar ANTES de cargar seed-cartas.sql (que ya trae la rareza).
--
--   Get-Content migrations\002_add_card_rarity.sql | docker exec -i arkana_db psql -U arkana_admin -d arkana_db
-- ============================================================
DO $$ BEGIN
  CREATE TYPE rarity_type AS ENUM ('COMUN', 'RARA', 'EPICA', 'LEGENDARIA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE cards
  ADD COLUMN IF NOT EXISTS rarity rarity_type NOT NULL DEFAULT 'COMUN';
