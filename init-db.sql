-- ============================================================
-- ARKANA TCG - Esquema del MVP (PostgreSQL)
-- Entidades: usuarios, catálogo de cartas, efectividad elemental,
-- etiquetas NFC, galería de usuarios e historial de partidas.
--
-- Decisiones del documento reflejadas aquí:
--  * JWT stateless  -> no hay tablas de sesión ni refresh_tokens.
--  * Las cartas NO tienen dueño -> nfc_tags solo valida que el chip existe.
--  * El equipo de 5 cartas de una batalla vive en memoria -> no se guarda.
--  * ARK-020: el mazo activo (5 cartas) del usuario SÍ se guarda en user_decks.
--  * El historial guarda solo resultados finales.
-- ============================================================
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE element_type AS ENUM ('FUEGO', 'AGUA', 'AIRE', 'TIERRA', 'PLANTA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ARK-009: rareza de las cartas (valores por confirmar con el PO)
DO $$ BEGIN
  CREATE TYPE rarity_type AS ENUM ('COMUN', 'RARA', 'EPICA', 'LEGENDARIA');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ------------------------------------------------------------
-- 1. Usuarios: datos de acceso + estadísticas básicas
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  username      VARCHAR(30)  NOT NULL,
  password_hash TEXT         NOT NULL,
  wins          INT          NOT NULL DEFAULT 0 CHECK (wins >= 0),
  losses        INT          NOT NULL DEFAULT 0 CHECK (losses >= 0),
  role          VARCHAR(20)  NOT NULL DEFAULT 'PLAYER' CHECK (role IN ('PLAYER', 'ADMIN')),
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_lower ON users (lower(username));

-- ------------------------------------------------------------
-- 2. Catálogo de cartas: stats base + habilidad en la misma tabla
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cards (
  id               SERIAL PRIMARY KEY,
  name             VARCHAR(50)  NOT NULL UNIQUE,
  element          element_type NOT NULL,
  rarity           rarity_type  NOT NULL DEFAULT 'COMUN',
  hp               INT NOT NULL CHECK (hp > 0),
  mana             INT NOT NULL CHECK (mana >= 0),
  attack           INT NOT NULL CHECK (attack >= 0),
  defense          INT NOT NULL CHECK (defense >= 0),
  speed            INT NOT NULL CHECK (speed >= 0),
  skill_name       VARCHAR(50)  NOT NULL,
  skill_mana_cost  INT NOT NULL CHECK (skill_mana_cost >= 0),
  skill_power      INT NOT NULL CHECK (skill_power >= 0),
  image_url        TEXT
);

-- ------------------------------------------------------------
-- 3. Efectividad elemental: multiplicadores de daño
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS element_effectiveness (
  attacker   element_type  NOT NULL,
  defender   element_type  NOT NULL,
  multiplier NUMERIC(3,2)  NOT NULL CHECK (multiplier > 0),
  PRIMARY KEY (attacker, defender)
);

-- ------------------------------------------------------------
-- 4. Etiquetas NFC: chip físico -> carta del catálogo (sin dueños)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS nfc_tags (
  nfc_id        VARCHAR(64) PRIMARY KEY,   -- UID en HEX mayúsculas, sin separadores
  card_id       INT NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_nfc_tags_card ON nfc_tags (card_id);

-- ------------------------------------------------------------
-- 5. Galería de usuarios: cartas que han pasado por sus manos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_gallery (
  user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  card_id     INT         NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  unlocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, card_id)
);

-- ------------------------------------------------------------
-- 6. Historial de partidas: solo resultado final
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS match_history (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id UUID NOT NULL REFERENCES users(id),
  player2_id UUID NOT NULL REFERENCES users(id),
  winner_id  UUID NOT NULL REFERENCES users(id),
  played_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (player1_id <> player2_id),
  CHECK (winner_id = player1_id OR winner_id = player2_id)
);
CREATE INDEX IF NOT EXISTS idx_match_history_p1 ON match_history (player1_id, played_at DESC);
CREATE INDEX IF NOT EXISTS idx_match_history_p2 ON match_history (player2_id, played_at DESC);

-- ------------------------------------------------------------
-- 7. Mazo activo (ARK-020): 5 cartas por usuario, sin repetir
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_decks (
  user_id    UUID        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_deck_cards (
  user_id  UUID     NOT NULL REFERENCES user_decks(user_id) ON DELETE CASCADE,
  position SMALLINT NOT NULL CHECK (position BETWEEN 1 AND 5),
  card_id  INT      NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, position),
  UNIQUE (user_id, card_id)
);

-- ============================================================
-- SEMILLAS
-- ============================================================

-- Ciclo de ventajas: Agua > Fuego > Planta > Tierra > Aire > Agua
-- (x2.0 ventaja, x0.5 desventaja; cualquier otro cruce es x1.0 y no se guarda)
INSERT INTO element_effectiveness (attacker, defender, multiplier) VALUES
  ('AGUA',   'FUEGO',  2.00), ('FUEGO',  'PLANTA', 2.00), ('PLANTA', 'TIERRA', 2.00),
  ('TIERRA', 'AIRE',   2.00), ('AIRE',   'AGUA',   2.00),
  ('FUEGO',  'AGUA',   0.50), ('PLANTA', 'FUEGO',  0.50), ('TIERRA', 'PLANTA', 0.50),
  ('AIRE',   'TIERRA', 0.50), ('AGUA',   'AIRE',   0.50)
ON CONFLICT DO NOTHING;

-- Catálogo inicial (2 animales por elemento)
INSERT INTO cards (name, element, hp, mana, attack, defense, speed, skill_name, skill_mana_cost, skill_power) VALUES
  ('Lobo de Fuego',        'FUEGO',  110, 5, 24,  8,  70, 'Garra Ígnea',      2, 22),
  ('Zorro Volcánico',      'FUEGO',  100, 4, 26,  6,  88, 'Llamarada',        2, 24),
  ('Tiburón Feroz',        'AGUA',   130, 5, 26, 10,  55, 'Mordida Abisal',   3, 26),
  ('Delfín Oceánico',      'AGUA',   105, 5, 22,  7,  92, 'Ola Veloz',        1, 20),
  ('Águila del Viento',    'AIRE',    95, 5, 22,  5, 100, 'Picada Huracán',   1, 20),
  ('Halcón de Tormenta',   'AIRE',   100, 4, 24,  6,  95, 'Ráfaga Cortante',  2, 22),
  ('Oso Continental',      'TIERRA', 150, 4, 24, 14,  30, 'Zarpazo Sísmico',  3, 24),
  ('Rinoceronte de Roca',  'TIERRA', 140, 3, 22, 15,  25, 'Embestida Rocosa', 3, 24),
  ('Jaguar Selvático',     'PLANTA', 105, 5, 24,  8,  75, 'Zarpa Espinosa',   2, 22),
  ('Serpiente Esmeralda',  'PLANTA', 115, 4, 22, 10,  60, 'Látigo de Vid',    2, 22)
ON CONFLICT (name) DO NOTHING;
