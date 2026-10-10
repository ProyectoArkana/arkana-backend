const test = require('node:test');
const assert = require('node:assert/strict');

test('Node.js funciona correctamente', () => {
    assert.equal(1 + 1, 2);
});

test('El backend puede validar datos de tipo string', () => {
    assert.equal(typeof 'Arkana', 'string');
});