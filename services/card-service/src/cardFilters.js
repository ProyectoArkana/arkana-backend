// Filtros del catálogo de cartas: búsqueda por nombre (ARK-008) + elemento, rareza,
// ataque y defensa (ARK-009). Devuelve condiciones SQL parametrizadas (nunca concatena valores).
const ELEMENTS = ['FUEGO', 'AGUA', 'AIRE', 'TIERRA', 'PLANTA'];
const RARITIES = ['COMUN', 'RARA', 'EPICA', 'LEGENDARIA'];

// Búsqueda sin distinguir mayúsculas ni acentos ("pajaro" encuentra "Pájaro").
// Se normaliza igual del lado de JS y del de SQL para no depender de extensiones de PostgreSQL.
const ACCENTS = 'áéíóúüÁÉÍÓÚÜ';
const PLAIN = 'aeiouuaeiouu';
const NORMALIZED_NAME = `translate(lower(c.name), '${ACCENTS}', '${PLAIN}')`;

const stripAccents = (value) => value.replace(/[áéíóúüÁÉÍÓÚÜ]/g, (ch) => PLAIN[ACCENTS.indexOf(ch)]);
const normalizeSearch = (value) => stripAccents(String(value ?? '').trim().slice(0, 50).toLowerCase());
const escapeLike = (value) => value.replace(/[\\%_]/g, '\\$&');

// ?x=a,b o ?x=a&x=b -> texto "a,b"
const asText = (value) => (Array.isArray(value) ? value.join(',') : String(value ?? '')).trim();

const parseEnumList = (value, allowed, label) => {
  const text = asText(value);
  if (!text) return { values: [] };
  const values = [
    ...new Set(
      text
        .split(',')
        .map((v) => stripAccents(v.trim()).toUpperCase())
        .filter(Boolean),
    ),
  ];
  const invalid = values.find((v) => !allowed.includes(v));
  if (invalid) return { error: `${label} inválido: ${invalid}. Valores permitidos: ${allowed.join(', ')}` };
  return { values };
};

const parseCount = (value, label) => {
  const text = asText(value);
  if (!text) return {};
  if (!/^\d{1,4}$/.test(text)) return { error: `${label} debe ser un entero entre 0 y 9999` };
  return { value: Number(text) };
};

// query: req.query. paramOffset: cuántos parámetros ($1..$n) ya usa la consulta que invoca.
// Devuelve { conditions, params } o { error } (para responder 400).
const buildCardFilters = (query = {}, paramOffset = 0) => {
  const conditions = [];
  const params = [];
  const add = (value) => {
    params.push(value);
    return `$${paramOffset + params.length}`;
  };

  const name = normalizeSearch(query.name);
  if (name) conditions.push(`${NORMALIZED_NAME} LIKE ${add(`%${escapeLike(name)}%`)}`);

  const elements = parseEnumList(query.element, ELEMENTS, 'Elemento');
  if (elements.error) return { error: elements.error };
  if (elements.values.length) conditions.push(`c.element = ANY(${add(elements.values)}::element_type[])`);

  const rarities = parseEnumList(query.rarity, RARITIES, 'Rareza');
  if (rarities.error) return { error: rarities.error };
  if (rarities.values.length) conditions.push(`c.rarity = ANY(${add(rarities.values)}::rarity_type[])`);

  const ranges = [
    ['attack', 'Ataque', 'c.attack'],
    ['defense', 'Defensa', 'c.defense'],
  ];
  for (const [key, label, column] of ranges) {
    const min = parseCount(query[`min_${key}`], `${label} mínimo`);
    const max = parseCount(query[`max_${key}`], `${label} máximo`);
    if (min.error || max.error) return { error: min.error || max.error };
    if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
      return { error: `${label} mínimo no puede ser mayor que el máximo` };
    }
    if (min.value !== undefined) conditions.push(`${column} >= ${add(min.value)}`);
    if (max.value !== undefined) conditions.push(`${column} <= ${add(max.value)}`);
  }

  return { conditions, params };
};

module.exports = { ELEMENTS, RARITIES, buildCardFilters };
