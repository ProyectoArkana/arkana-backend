const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '../services');
const servicios = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

test('existe al menos un microservicio', () => {
  assert.ok(servicios.length > 0);
});

for (const s of servicios) {
  test(`${s}: package.json válido y nombre @arkana/${s}`, () => {
    const ruta = path.join(dir, s, 'package.json');
    assert.ok(fs.existsSync(ruta), 'falta package.json');
    const pkg = JSON.parse(fs.readFileSync(ruta, 'utf8'));
    assert.strictEqual(pkg.name, `@arkana/${s}`);
  });
}