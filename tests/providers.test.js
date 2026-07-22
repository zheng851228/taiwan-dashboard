import { describe, expect, it } from 'vitest';
import {
  buildReferenceSpeedByLink,
  mergeTdxDetectors,
  normalizeCwaForecasts,
  normalizeTdxIncidents
} from '../worker/src/providers.js';

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

describe('TDX road-event normalization', () => {
  it('maps the current LiveEvent schema and WKT coordinates', () => {
    const [incident] = normalizeTdxIncidents({
      UpdateTime: '2026-07-23T00:20:00+08:00',
      LiveEvents: [{
        EventID: 'event-1',
        EventTitle: '道路施工',
        Description: '外側車道施工',
        Positions: 'POINT (120.7055929 24.2005723)',
        Location: { FreeExpressHighway: { Road: '台74' } },
        Impact: {
          Severity: 1,
          Duration: { DurationEndTime: '2026-07-23T02:00:00+08:00' }
        },
        LastUpdateTime: '2026-07-23T00:15:01+08:00'
      }]
    });

    expect(incident).toMatchObject({
      id: 'event-1',
      title: '道路施工',
      roadRef: '台74',
      lat: 24.2005723,
      lng: 120.7055929,
      severity: 1,
      updatedAt: '2026-07-23T00:15:01+08:00',
      expiresAt: '2026-07-23T02:00:00+08:00',
      source: 'TDX'
    });
  });
});

describe('TDX directional detector fusion', () => {
  it('uses DetectionLink bearing and official congestion thresholds as the reference speed', () => {
    const referenceByLink = buildReferenceSpeedByLink(
      { Sections: [{ SectionID: 'section-1', LinkIDs: [{ LinkID: 'link-1' }] }] },
      { LiveTraffics: [{ SectionID: 'section-1', CongestionLevelID: 'D' }] },
      {
        CongestionLevels: [{
          CongestionLevelID: 'D',
          MeasureIndex: 'Speed',
          Levels: [{ Level: 1, LowValue: 60 }]
        }]
      }
    );
    const [detector] = mergeTdxDetectors(
      {
        VDs: [{
          VDID: 'vd-1',
          PositionLat: 25.05,
          PositionLon: 121.52,
          RoadName: '\u53f09\u7dda',
          DetectionLinks: [{ LinkID: 'link-1', Bearing: 'E' }]
        }]
      },
      {
        VDLives: [{
          VDID: 'vd-1',
          DataCollectTime: '2026-07-23T00:20:00+08:00',
          LinkFlows: [{
            LinkID: 'link-1',
            Lanes: [
              { Speed: 60, Vehicles: [{ Volume: 2 }] },
              { Speed: 30, Vehicles: [{ Volume: 2 }] },
              { Speed: 0, Vehicles: [{ Volume: 0 }] }
            ]
          }]
        }]
      },
      referenceByLink
    );

    expect(detector).toMatchObject({
      id: 'vd-1:link-1',
      heading: 90,
      roadRef: '\u53f09\u7dda',
      speedKph: 45,
      referenceSpeedKph: 80,
      source: 'TDX'
    });
  });

  it('keeps a missing reference speed unknown instead of coercing null to zero', () => {
    const [detector] = mergeTdxDetectors(
      {
        VDs: [{
          VDID: 'vd-null',
          PositionLat: 25.05,
          PositionLon: 121.52,
          SpeedLimit: null,
          DetectionLinks: [{ LinkID: 'link-null', Bearing: 0 }]
        }]
      },
      {
        VDLives: [{
          VDID: 'vd-null',
          Status: 0,
          LinkFlows: [{
            LinkID: 'link-null',
            Lanes: [{ Speed: 40, Vehicles: [{ Volume: 1 }] }]
          }]
        }]
      }
    );

    expect(detector).toMatchObject({ heading: 0, referenceSpeedKph: null });
  });
});
