-- Estructura completa PROYECTO ARKANA (TCG con NFC)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- AUTH SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  username      VARCHAR(30) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);

-- ============================================================
-- USER SERVICE
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  user_id    UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  avatar_url TEXT,
  trophies   INT NOT NULL DEFAULT 0,
  wins       INT NOT NULL DEFAULT 0,
  losses     INT NOT NULL DEFAULT 0
);

-- ============================================================
-- CARDS SERVICE
-- ============================================================
DO $$ BEGIN
  CREATE TYPE element_type AS ENUM ('fuego', 'agua', 'tierra', 'aire', 'luz', 'oscuridad');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS cards (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  element    element_type NOT NULL,
  hp         INT NOT NULL,
  mana_cost  INT NOT NULL,
  attack     INT NOT NULL,
  image_url  TEXT,
  rarity     VARCHAR(30) NOT NULL DEFAULT 'common'
);

CREATE TABLE IF NOT EXISTS element_effectiveness (
  attacker   element_type NOT NULL,
  defender   element_type NOT NULL,
  multiplier NUMERIC(4,2) NOT NULL DEFAULT 1.0,
  PRIMARY KEY (attacker, defender)
);

CREATE TABLE IF NOT EXISTS physical_cards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nfc_uid    VARCHAR(64) UNIQUE NOT NULL,
  card_id    INT NOT NULL REFERENCES cards(id),
  owner_id   UUID REFERENCES profiles(user_id),
  claimed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS decks (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id   UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  name      VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS deck_cards (
  deck_id          UUID NOT NULL REFERENCES decks(id) ON DELETE CASCADE,
  physical_card_id UUID NOT NULL REFERENCES physical_cards(id),
  slot             SMALLINT NOT NULL,
  PRIMARY KEY (deck_id, slot),
  UNIQUE (deck_id, physical_card_id)
);

-- ============================================================
-- MATCH SERVICE
-- ============================================================
DO $$ BEGIN
  CREATE TYPE match_status AS ENUM ('waiting', 'active', 'finished', 'cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player1_id  UUID NOT NULL REFERENCES profiles(user_id),
  player2_id  UUID REFERENCES profiles(user_id),
  status      match_status NOT NULL DEFAULT 'waiting',
  winner_id   UUID REFERENCES profiles(user_id),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS match_scanned_cards (
  match_id         UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(user_id),
  physical_card_id UUID NOT NULL REFERENCES physical_cards(id),
  scanned_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, physical_card_id)
);

CREATE TABLE IF NOT EXISTS match_events (
  id         BIGSERIAL PRIMARY KEY,
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  turn       INT NOT NULL DEFAULT 0,
  actor_id   UUID REFERENCES profiles(user_id),
  event_type VARCHAR(50) NOT NULL,
  payload    JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_physical_cards_owner ON physical_cards(owner_id);
CREATE INDEX IF NOT EXISTS idx_physical_cards_nfc ON physical_cards(nfc_uid);
CREATE INDEX IF NOT EXISTS idx_decks_user ON decks(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_players ON matches(player1_id, player2_id);
CREATE INDEX IF NOT EXISTS idx_match_events_match ON match_events(match_id);
