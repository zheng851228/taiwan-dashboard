import { describe, expect, it } from 'vitest';
import { normalizeCwaForecasts } from '../worker/src/providers.js';

const NOW = new Date('2026-07-22T04:00:00.000Z');

describe('CWA township forecast normalization', () => {
  it('selects the forecast period that overlaps the next three hours', () => {
    const payload = {
      records: {
        Locations: [{
          LocationsName: '\u81fa\u5317\u5e02',
          Update: '2026-07-22T11:30:00+08:00',
          Location: [{
            LocationName: '\u4e2d\u6b63\u5340',
            Latitude: '25.0324',
            Longitude: '121.5199',
            WeatherElement: [
              {
                ElementName: '\u6eab\u5ea6',
                Time: [
                  { DataTime: '2026-07-22T03:00:00.000Z', ElementValue: [{ Temperature: '26' }] },
                  { DataTime: '2026-07-22T06:00:00.000Z', ElementValue: [{ Temperature: '28' }] }
                ]
              },
              {
                ElementName: '3\u5c0f\u6642\u964d\u96e8\u6a5f\u7387',
                Time: [
                  {
                    StartTime: '2026-07-22T03:00:00.000Z',
                    EndTime: '2026-07-22T06:00:00.000Z',
                    ElementValue: [{ ProbabilityOfPrecipitation: '70' }]
                  }
                ]
              },
              {
                ElementName: '\u5929\u6c23\u73fe\u8c61',
                Time: [{
                  StartTime: '2026-07-22T03:00:00.000Z',
                  EndTime: '2026-07-22T06:00:00.000Z',
                  ElementValue: [{ Weather: '\u77ed\u66ab\u96e8' }]
                }]
              }
            ]
          }]
        }]
      }
    };

    const [forecast] = normalizeCwaForecasts(payload, NOW);
    expect(forecast.county).toBe('\u53f0\u5317\u5e02');
    expect(forecast.town).toBe('\u4e2d\u6b63\u5340');
    expect(forecast.temperatureC).toBe(28);
    expect(forecast.rainChance).toBe(70);
    expect(forecast.condition).toBe('\u77ed\u66ab\u96e8');
    expect(forecast.forecastAt).toBe('2026-07-22T03:00:00.000Z');
  });

  it('keeps the legacy county forecast format compatible', () => {
    const payload = {
      records: {
        location: [{
          locationName: '\u81fa\u5317\u5e02',
          weatherElement: [
            { elementName: 'Wx', time: [{ startTime: '2026-07-22T06:00:00.000Z', parameter: { parameterName: '\u591a\u96f2' } }] },
            { elementName: 'PoP', time: [{ parameter: { parameterName: '20' } }] },
            { elementName: 'MinT', time: [{ parameter: { parameterName: '24' } }] },
            { elementName: 'MaxT', time: [{ parameter: { parameterName: '30' } }] }
          ]
        }]
      }
    };

    const [forecast] = normalizeCwaForecasts(payload, NOW);
    expect(forecast.county).toBe('\u53f0\u5317\u5e02');
    expect(forecast.condition).toBe('\u591a\u96f2');
    expect(forecast.temperatureC).toBe(27);
    expect(forecast.rainChance).toBe(20);
  });
});
