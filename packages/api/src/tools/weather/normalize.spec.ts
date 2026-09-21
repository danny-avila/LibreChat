import type { OneCallRecord, OneCallResponse } from './types';
import {
  normalizeCurrentForecast,
  normalizeDailyAggregation,
  selectDailyRecord,
  stripPagination,
  synthesizeOverview,
  utcDateString,
} from './normalize';

const currentResponse: OneCallResponse = {
  lat: 35.9606,
  lon: -83.9207,
  timezone: 'America/New_York',
  timezone_offset: -18000,
  data: [
    {
      dt: 1583280000,
      temp: 20.4,
      feels_like: 18.6,
      weather: [{ description: 'clear sky' }],
    },
  ],
};

const dailyResponse: OneCallResponse = {
  lat: 35.9606,
  lon: -83.9207,
  timezone: 'America/New_York',
  data: [
    {
      dt: 1583280000,
      temp: { morn: 10.2, day: 20.4, eve: 15.6, night: 8.1, min: 7.4, max: 21.9 },
      humidity: 70,
      clouds: 12,
      pressure: 1016,
      wind_speed: 4.2,
      wind_deg: 180,
      weather: [{ description: 'few clouds' }],
    },
  ],
  next: 'https://api.openweathermap.org/data/4.0/onecall/timeline/1day?appid=SECRET',
};

describe('OpenWeather 4.0 normalizers', () => {
  it('formats a unix timestamp as a UTC YYYY-MM-DD date', () => {
    expect(utcDateString(1583280000)).toBe('2020-03-04');
  });

  it('lifts 4.0 data arrays into the current/hourly/daily/minutely contract', () => {
    const result = normalizeCurrentForecast({
      current: currentResponse,
      hourly: { data: [{ dt: 1, temp: 19 }] },
      daily: dailyResponse,
      minutely: { data: [{ dt: 1, precipitation: 0 }] },
    });

    expect(result.lat).toBe(35.9606);
    expect(result.lon).toBe(-83.9207);
    expect(result.timezone).toBe('America/New_York');
    expect(result.current?.temp).toBe(20.4);
    expect(result.hourly?.[0].temp).toBe(19);
    expect(result.daily?.[0].temp).toEqual(dailyResponse.data?.[0].temp);
    expect(result.minutely?.[0].precipitation).toBe(0);
  });

  it('maps a 4.0 daily record onto the day-summary temperature fields', () => {
    const result = normalizeDailyAggregation(dailyResponse, '2020-03-04', 'metric');

    expect(result.date).toBe('2020-03-04');
    expect(result.units).toBe('metric');
    expect(result.tz).toBe('America/New_York');
    expect(result.temperature).toEqual({
      min: 7.4,
      max: 21.9,
      morning: 10.2,
      afternoon: 20.4,
      evening: 15.6,
      night: 8.1,
    });
    expect(result.humidity?.afternoon).toBe(70);
    expect(result.cloud_cover?.afternoon).toBe(12);
  });

  it('selects the daily record whose UTC date matches the request', () => {
    const records: OneCallRecord[] = [
      { dt: 1583193600, temp: { day: 1 } },
      { dt: 1583280000, temp: { day: 2 } },
    ];
    expect(selectDailyRecord(records, '2020-03-04')?.temp).toEqual({ day: 2 });
  });

  it('drops next/prev so pagination URLs never leave the client', () => {
    const stripped = stripPagination(dailyResponse);
    expect(stripped.next).toBeUndefined();
    expect(stripped.prev).toBeUndefined();
    expect(stripped.data).toEqual(dailyResponse.data);
  });

  it('synthesizes an overview from current conditions', () => {
    const result = synthesizeOverview({
      current: currentResponse.data?.[0],
      date: '2020-03-04',
      units: 'metric',
      lat: 35.96,
      lon: -83.92,
      timezone: 'America/New_York',
    });

    expect(result.weather_overview).toBe(
      'Currently, the temperature is 20.4°C with a real feel of 18.6°C. The sky is clear sky.',
    );
    expect(result.units).toBe('metric');
    expect(result.date).toBe('2020-03-04');
  });

  it('synthesizes an overview from a daily record when current weather is absent', () => {
    const result = synthesizeOverview({
      daily: dailyResponse.data?.[0],
      date: '2020-03-04',
      units: 'imperial',
    });

    expect(result.weather_overview).toBe('Temperatures range from 7.4°F to 21.9°F. Few clouds.');
  });
});
