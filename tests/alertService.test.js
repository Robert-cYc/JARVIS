import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import {
  parseAlertCommand,
  describeAlert,
  evaluatePriceAlert,
  addPriceAlert,
  deletePriceAlert,
  getAlertState,
  haversineKm,
  filterTaiwanQuakes,
  formatQuakeLine,
  runAlertCheckCycle,
  GOLD_TWD_SYMBOL
} from '../src/server/services/alertService.js';

const tmpAlertPath = path.join(os.tmpdir(), `jarvis_test_alerts_${Date.now()}.json`);

describe('J.A.R.V.I.S. Sentinel — Price & Seismic Alerts', () => {
  after(async () => {
    await fs.rm(tmpAlertPath, { force: true }).catch(() => {});
  });

  it('parses natural language price alerts (Chinese & English)', () => {
    const goldAlert = parseAlertCommand('黃金漲破 NT$16,000 通知我');
    assert.ok(goldAlert);
    assert.equal(goldAlert.symbol, GOLD_TWD_SYMBOL);
    assert.equal(goldAlert.condition, 'above');
    assert.equal(goldAlert.threshold, 16000);

    const stockDrop = parseAlertCommand('0050 跌 3% 提醒我');
    assert.ok(stockDrop);
    assert.equal(stockDrop.symbol, '0050.TW');
    assert.equal(stockDrop.condition, 'change_down');
    assert.equal(stockDrop.threshold, 3);

    const nvdaAlert = parseAlertCommand('alert me if NVDA drops below 110');
    assert.ok(nvdaAlert);
    assert.equal(nvdaAlert.symbol, 'NVDA');
    assert.equal(nvdaAlert.condition, 'below');
    assert.equal(nvdaAlert.threshold, 110);

    const shorthand = parseAlertCommand('0050 > 180', { requireTrigger: false });
    assert.ok(shorthand);
    assert.equal(shorthand.symbol, '0050.TW');
    assert.equal(shorthand.condition, 'above');
    assert.equal(shorthand.threshold, 180);

    const noAlert = parseAlertCommand('今天天氣如何？');
    assert.equal(noAlert, null);
  });

  it('evaluates price alert conditions accurately', () => {
    const aboveAlert = { symbol: 'NVDA', condition: 'above', threshold: 120 };
    assert.equal(evaluatePriceAlert(aboveAlert, { price: 125 }), true);
    assert.equal(evaluatePriceAlert(aboveAlert, { price: 119 }), false);

    const dropPctAlert = { symbol: '0050.TW', condition: 'change_down', threshold: 2.5 };
    assert.equal(evaluatePriceAlert(dropPctAlert, { price: 150, changePercent: -3.0 }), true);
    assert.equal(evaluatePriceAlert(dropPctAlert, { price: 150, changePercent: -1.5 }), false);
  });

  it('adds, evaluates, triggers, and deletes price alerts in alertState', async () => {
    const alert = await addPriceAlert(
      { symbol: 'TSLA', condition: 'above', threshold: 250 },
      tmpAlertPath
    );
    assert.ok(alert.id);
    assert.equal(alert.symbol, 'TSLA');

    const state = await getAlertState(tmpAlertPath);
    assert.equal(state.priceAlerts.length, 1);

    // Mock check cycle where TSLA price hits 260
    const events = await runAlertCheckCycle({
      fetchQuotes: async (syms) => ({ TSLA: { price: 260, changePercent: 4.5 } }),
      fetchQuakes: async () => ({ quakes: [] }),
      alertsPath: tmpAlertPath
    });

    assert.equal(events.length, 1);
    assert.ok(events[0].title.includes('PRICE ALERT'));

    const stateAfter = await getAlertState(tmpAlertPath);
    assert.equal(stateAfter.priceAlerts[0].triggered, true);

    await deletePriceAlert(alert.id, tmpAlertPath);
    const stateEmpty = await getAlertState(tmpAlertPath);
    assert.equal(stateEmpty.priceAlerts.length, 0);
  });

  it('computes haversine distance and filters Taiwan earthquakes from USGS GeoJSON', () => {
    // Kaohsiung to Taipei is ~300 km
    const dist = haversineKm(22.6273, 120.3014, 25.033, 121.5654);
    assert.ok(dist > 280 && dist < 320);

    const mockGeoJson = {
      features: [
        {
          id: 'us7000tw01',
          properties: {
            mag: 5.2,
            place: '15 km ENE of Hualien City, Taiwan',
            time: Date.now() - 60000,
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000tw01'
          },
          geometry: {
            coordinates: [121.75, 24.05, 10.5]
          }
        },
        {
          id: 'us7000faraway',
          properties: {
            mag: 6.8,
            place: 'Fiji region',
            time: Date.now(),
            url: 'https://earthquake.usgs.gov/earthquakes/eventpage/us7000faraway'
          },
          geometry: {
            coordinates: [-178.0, -20.0, 500]
          }
        }
      ]
    };

    const quakes = filterTaiwanQuakes(mockGeoJson, { minMagnitude: 4.5, radiusKm: 350 });
    assert.equal(quakes.length, 1);
    assert.equal(quakes[0].id, 'us7000tw01');
    assert.equal(quakes[0].magnitude, 5.2);
    assert.ok(quakes[0].distanceToKaohsiungKm > 0);

    const line = formatQuakeLine(quakes[0]);
    assert.ok(line.includes('M5.2'));
    assert.ok(line.includes('Hualien'));
  });
});
