-- ============================================================
-- ARK-020 - Mazo activo del usuario (5 cartas)
-- Para bases de datos YA creadas. Es seguro ejecutarla más de una vez.
--
--   Get-Content migrations\003_add_user_decks.sql | docker exec -i arkana_db psql -U arkana_admin -d arkana_db
-- ============================================================
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
