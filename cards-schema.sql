-- Tipos y Tablas de Cartas
CREATE TYPE element_type AS ENUM ('FUEGO', 'AGUA', 'AIRE', 'TIERRA', 'PLANTA');

CREATE TABLE IF NOT EXISTS cards (
  id          SERIAL PRIMARY KEY,
  name        VARCHAR(50) UNIQUE NOT NULL,
  element     element_type NOT NULL,
  hp          INT NOT NULL CHECK (hp > 0),
  mana_cost   INT NOT NULL CHECK (mana_cost >= 0),
  attack      INT NOT NULL CHECK (attack > 0),
  image_url   TEXT,
  rarity      VARCHAR(20) NOT NULL DEFAULT 'COMUN'
);

CREATE TABLE IF NOT EXISTS element_effectiveness (
  attacker element_type NOT NULL,
  defender element_type NOT NULL,
  multiplier NUMERIC(3,2) NOT NULL,
  PRIMARY KEY (attacker, defender)
);

CREATE TABLE IF NOT EXISTS physical_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfc_uid    VARCHAR(32) UNIQUE NOT NULL,
  card_id    INT NOT NULL REFERENCES cards(id),
  owner_id   UUID REFERENCES users(id),
  claimed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS decks (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name      VARCHAR(40) NOT NULL DEFAULT 'Mazo Principal',
  is_active BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id          UUID REFERENCES decks(id) ON DELETE CASCADE,
  physical_card_id UUID REFERENCES physical_cards(id),
  slot             SMALLINT NOT NULL CHECK (slot BETWEEN 1 AND 5),
  PRIMARY KEY (deck_id, slot),
  UNIQUE (deck_id, physical_card_id)
);

-- SEMILLA INICIAL: Matriz de Efectividad Elemental (×2.0 Ventaja, ×0.5 Desventaja, ×1.0 Neutro)
-- Agua > Fuego > Planta > Tierra > Aire > Agua
INSERT INTO element_effectiveness (attacker, defender, multiplier) VALUES
  ('AGUA', 'FUEGO', 2.00), ('FUEGO', 'PLANTA', 2.00), ('PLANTA', 'TIERRA', 2.00),
  ('TIERRA', 'AIRE', 2.00), ('AIRE', 'AGUA', 2.00),
  ('FUEGO', 'AGUA', 0.50), ('PLANTA', 'FUEGO', 0.50), ('TIERRA', 'PLANTA', 0.50),
  ('AIRE', 'TIERRA', 0.50), ('AGUA', 'AIRE', 0.50)
ON CONFLICT DO NOTHING;

-- SEMILLA INICIAL: Catálogo de Cartas
INSERT INTO cards (name, element, hp, mana_cost, attack, rarity) VALUES
  ('Lobo de Fuego', 'FUEGO', 100, 2, 35, 'COMUN'),
  ('Tiburón Feroz', 'AGUA', 120, 3, 40, 'RARA'),
  ('Águila Del Viento', 'AIRE', 80, 1, 25, 'COMUN'),
  ('Oso Continental', 'TIERRA', 150, 4, 45, 'EPICA'),
  ('Jaguar Selvático', 'PLANTA', 90, 2, 30, 'COMUN')
ON CONFLICT DO NOTHING;