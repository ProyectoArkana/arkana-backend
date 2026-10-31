-- ============================================================
-- Cartas reales de Arkana + sus chips NFC.
-- Se puede ejecutar varias veces: actualiza en lugar de duplicar.
--
--   docker exec -i arkana_db psql -U arkana_admin -d arkana_db < seed-cartas.sql
--
-- Requiere la columna cards.rarity (init-db.sql o migrations/002_add_card_rarity.sql).
-- Rarezas: COMUN | RARA | EPICA | LEGENDARIA (valores provisionales, confirmar con el PO).
--
-- Escala del juego: hp 95-150 | ataque 18-28 | defensa 5-15 | velocidad 25-100
--                   maná 3-5  | costo habilidad 1-3 | poder habilidad 18-26
-- ============================================================
BEGIN;

INSERT INTO cards
  (name, element, rarity, hp, mana, attack, defense, speed, skill_name, skill_mana_cost, skill_power, image_url)
VALUES
  ('Pájaro de Fuego', 'FUEGO', 'LEGENDARIA',  106, 5, 24, 10, 85, 'Aliento Ígneo',      3, 26, 'https://raw.githubusercontent.com/UgaldeZarzaRaul/imagenes-/main/phenix.jpeg'),
  ('Rabito',          'TIERRA', 'COMUN', 139, 4, 24, 13, 70, 'Pisotón Sísmico',    2, 22, 'https://raw.githubusercontent.com/UgaldeZarzaRaul/imagenes-/main/conejo.jpeg'),
  ('Oso PoderOSO',    'AIRE', 'EPICA',    95, 4, 28, 15, 75, 'Zarpazo Huracán',    3, 24, 'https://raw.githubusercontent.com/UgaldeZarzaRaul/imagenes-/main/oso.jpeg'),
  ('Ballena',         'AGUA', 'RARA',   117, 5, 21,  5, 30, 'Chorro Marino',      1, 18, 'https://raw.githubusercontent.com/UgaldeZarzaRaul/imagenes-/main/dolphin.jpeg'),
  ('Zorrito',         'PLANTA', 'COMUN', 150, 5, 18,  9, 80, 'Raíces Enredaderas', 1, 18, 'https://raw.githubusercontent.com/UgaldeZarzaRaul/imagenes-/main/zorrito.jpeg'),
  ('Jeff',            'AGUA', 'RARA',   150, 4, 24, 10, 50, 'Embestida Glacial',  2, 22, 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/154.png')
ON CONFLICT (name) DO UPDATE SET
  element = EXCLUDED.element, rarity = EXCLUDED.rarity, hp = EXCLUDED.hp, mana = EXCLUDED.mana,
  attack = EXCLUDED.attack, defense = EXCLUDED.defense, speed = EXCLUDED.speed,
  skill_name = EXCLUDED.skill_name, skill_mana_cost = EXCLUDED.skill_mana_cost,
  skill_power = EXCLUDED.skill_power, image_url = EXCLUDED.image_url;

-- Chip físico (el id impreso en la carta) -> carta del catálogo
INSERT INTO nfc_tags (nfc_id, card_id)
SELECT v.nfc_id, c.id
FROM (VALUES
  ('9A8FD110', 'Pájaro de Fuego'),   -- fénix
  ('9A940C11', 'Rabito'),            -- conejo
  ('6A66BB10', 'Oso PoderOSO'),      -- oso polar
  ('A38034E2', 'Ballena'),           -- ballena
  ('4A7E1D11', 'Zorrito'),           -- zorrito
  ('C3DE7996', 'Jeff')               -- pingüino
) AS v(nfc_id, card_name)
JOIN cards c ON c.name = v.card_name
ON CONFLICT (nfc_id) DO UPDATE SET card_id = EXCLUDED.card_id;

COMMIT;

-- Verificación
SELECT t.nfc_id, c.name, c.element, c.hp, c.attack, c.defense, c.speed
FROM nfc_tags t JOIN cards c ON c.id = t.card_id
WHERE t.nfc_id IN ('9A8FD110','9A940C11','6A66BB10','A38034E2','4A7E1D11','C3DE7996')
ORDER BY c.name;
