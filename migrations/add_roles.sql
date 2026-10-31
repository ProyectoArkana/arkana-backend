-- ============================================================
-- ARK-011 - Roles de usuario
-- Para bases de datos YA creadas (init-db.sql solo corre al crear el volumen).
-- Es seguro ejecutarla más de una vez.
--
--   Windows (PowerShell), desde la raíz del backend:
--   Get-Content migrations\001_add_roles.sql | docker exec -i arkana_db psql -U arkana_admin -d arkana_db
-- ============================================================
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'PLAYER'
  CHECK (role IN ('PLAYER', 'ADMIN'));
