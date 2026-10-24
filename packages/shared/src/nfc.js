// El UID del chip puede llegar como "04:a1:b2", "04 A1 B2" o "04A1B2": se guarda siempre
// en HEX mayúsculas sin separadores para que backend y app comparen igual.
const normalizeNfcId = (value) =>
  String(value ?? '')
    .replace(/[^0-9a-f]/gi, '')
    .toUpperCase();

module.exports = { normalizeNfcId };
