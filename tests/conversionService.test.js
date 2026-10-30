import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  convertTemperature,
  convertPhysicalUnit,
  resolveCurrencyCode,
  detectConversionIntent,
  executeConversionSkill
} from '../src/server/services/conversionService.js';

describe('J.A.R.V.I.S. Currency & Unit Conversion Engine', () => {
  it('converts temperature accurately across Celsius, Fahrenheit, and Kelvin', () => {
    // 32 F = 0 C
    const cFromF = convertTemperature(32, 'F', 'C');
    assert.ok(cFromF);
    assert.equal(cFromF.result, 0);

    // 100 C = 212 F
    const fFromC = convertTemperature(100, 'C', 'F');
    assert.ok(fFromC);
    assert.equal(fFromC.result, 212);

    // 0 C = 273.15 K
    const kFromC = convertTemperature(0, 'C', 'K');
    assert.ok(kFromC);
    assert.equal(kFromC.result, 273.15);
  });

  it('converts length, mass, volume, and area accurately', () => {
    // Mass: 100 kg to lbs (~220.462)
    const mass = convertPhysicalUnit(100, '公斤', '磅');
    assert.ok(mass);
    assert.equal(mass.category, 'mass');
    assert.ok(mass.result > 220 && mass.result < 221);

    // Traditional Taiwan Weight: 1 台斤 = 0.6 kg = 600 g
    const taijin = convertPhysicalUnit(1, '台斤', '公克');
    assert.ok(taijin);
    assert.equal(taijin.result, 600);

    // Length: 1 英里 to 公里 (~1.6093)
    const length = convertPhysicalUnit(1, '英里', '公里');
    assert.ok(length);
    assert.equal(length.category, 'length');
    assert.equal(length.result, 1.6093);

    // Traditional Taiwan Area: 1 坪 to 平方公尺 (~3.3058)
    const ping = convertPhysicalUnit(1, '坪', '平方公尺');
    assert.ok(ping);
    assert.equal(ping.category, 'area');
    assert.equal(ping.result, 3.3058);

    // Volume: 1 gallon to liters (~3.7854)
    const volume = convertPhysicalUnit(1, '加侖', '公升');
    assert.ok(volume);
    assert.equal(volume.category, 'volume');
    assert.equal(volume.result, 3.7854);
  });

  it('resolves currency aliases correctly', () => {
    assert.equal(resolveCurrencyCode('美金'), 'USD');
    assert.equal(resolveCurrencyCode('台幣'), 'TWD');
    assert.equal(resolveCurrencyCode('新台幣'), 'TWD');
    assert.equal(resolveCurrencyCode('日圓'), 'JPY');
    assert.equal(resolveCurrencyCode('日幣'), 'JPY');
    assert.equal(resolveCurrencyCode('歐元'), 'EUR');
    assert.equal(resolveCurrencyCode('英鎊'), 'GBP');
    assert.equal(resolveCurrencyCode('USD'), 'USD');
    assert.equal(resolveCurrencyCode('twd'), 'TWD');
  });

  it('detects natural language conversion intents (Chinese & English)', () => {
    // Currency
    const cur1 = detectConversionIntent('1500 美金換台幣');
    assert.ok(cur1);
    assert.equal(cur1.type, 'currency');
    assert.equal(cur1.amount, 1500);
    assert.equal(cur1.from, 'USD');
    assert.equal(cur1.to, 'TWD');

    const cur2 = detectConversionIntent('3000 USD to TWD');
    assert.ok(cur2);
    assert.equal(cur2.amount, 3000);
    assert.equal(cur2.from, 'USD');
    assert.equal(cur2.to, 'TWD');

    const cur3 = detectConversionIntent('10 萬日圓等於多少台幣');
    assert.ok(cur3);
    assert.equal(cur3.amount, 100000);
    assert.equal(cur3.from, 'JPY');
    assert.equal(cur3.to, 'TWD');

    // Units
    const u1 = detectConversionIntent('30 磅是幾公斤');
    assert.ok(u1);
    assert.equal(u1.type, 'unit');
    assert.equal(u1.amount, 30);
    assert.equal(u1.from, '磅');
    assert.equal(u1.to, '公斤');

    const u2 = detectConversionIntent('75 華氏度換攝氏');
    assert.ok(u2);
    assert.equal(u2.type, 'unit');
    assert.equal(u2.amount, 75);

    const nonMatch = detectConversionIntent('今天天氣如何？');
    assert.equal(nonMatch, null);
  });

  it('executes unit conversion skill directly and returns formatted summary', async () => {
    const res = await executeConversionSkill('100 公斤換磅');
    assert.equal(res.executed, true);
    assert.equal(res.skill, 'conversion_telemetry');
    assert.ok(res.summaryText.includes('100'));
    assert.ok(res.items.length > 0);
  });
});
