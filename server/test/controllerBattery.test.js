const test = require('node:test');
const assert = require('node:assert/strict');

const { parseBatteryByte } = require('../services/controllerBattery');

test('parseBatteryByte reads the low nibble as a 0-10 level scaled to a percentage', () => {
  assert.deepEqual(parseBatteryByte(0x05), { battery: 50, charging: false });
  assert.deepEqual(parseBatteryByte(0x00), { battery: 0, charging: false });
});

test('parseBatteryByte reports charging via bit 0x10', () => {
  assert.deepEqual(parseBatteryByte(0x15), { battery: 50, charging: true });
});

test('parseBatteryByte reports 100% when the full flag (0x20) is set, regardless of level nibble', () => {
  assert.deepEqual(parseBatteryByte(0x20), { battery: 100, charging: false });
  assert.deepEqual(parseBatteryByte(0x23), { battery: 100, charging: false });
});

test('parseBatteryByte clamps a level nibble above 10 to 100%', () => {
  const result = parseBatteryByte(0x0f); // level nibble 15, not marked full
  assert.equal(result.battery, 100);
});
