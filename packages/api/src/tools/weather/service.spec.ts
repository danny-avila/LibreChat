import type { OpenWeatherFetcher } from './types';
import {
  convertDateToUnix,
  executeOpenWeather,
  getOpenWeatherHelp,
  isOpenWeatherPaginationUrl,
  OPEN_WEATHER_TOOL_DESCRIPTION,
} from './service';

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createFetch(handler: (url: URL) => ReturnType<typeof jsonResponse>): {
  fetch: OpenWeatherFetcher;
  urls: string[];
} {
  const urls: string[] = [];
  const fetch: OpenWeatherFetcher = async (url) => {
    urls.push(url);
    return handler(new URL(url));
  };
  return { fetch, urls };
}

describe('executeOpenWeather', () => {
  const apiKey = 'test-api-key';
  const geoBody = [{ lat: 35.9606, lon: -83.9207 }];

  it('describes One Call API 4.0 in the tool string and help payload', () => {
    expect(OPEN_WEATHER_TOOL_DESCRIPTION).toContain('One Call API 4.0');
    const help = JSON.parse(getOpenWeatherHelp()) as { title: string };
    expect(help.title).toBe('OpenWeather One Call API 4.0 Help');
  });

  it('converts a calendar date to a UTC unix timestamp and rejects non-ISO dates', () => {
    expect(convertDateToUnix('2020-03-04')).toBe(1583280000);
    expect(() => convertDateToUnix('03-04-2020')).toThrow(
      'Invalid date format. Expected YYYY-MM-DD.',
    );
  });

  it('accepts only https OpenWeather 4.0 pagination URLs', () => {
    expect(
      isOpenWeatherPaginationUrl(
        'https://api.openweathermap.org/data/4.0/onecall/timeline/1h?start=1',
      ),
    ).toBe(true);
    expect(
      isOpenWeatherPaginationUrl(
        'http://api.openweathermap.org/data/4.0/onecall/timeline/1h?start=1',
      ),
    ).toBe(false);
    expect(isOpenWeatherPaginationUrl('https://evil.example/data/4.0/onecall/timeline/1h')).toBe(
      false,
    );
  });

  it('geocodes a city and combines 4.0 current, hourly, daily, and minutely endpoints', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname === '/geo/1.0/direct') {
        return jsonResponse(geoBody);
      }
      if (url.pathname === '/data/4.0/onecall/current') {
        return jsonResponse({
          lat: 35.9606,
          lon: -83.9207,
          timezone: 'America/New_York',
          data: [{ temp: 293.15, feels_like: 295.15 }],
        });
      }
      if (url.pathname === '/data/4.0/onecall/timeline/1h') {
        return jsonResponse({ data: [{ dt: 1, temp: 291.4 }] });
      }
      if (url.pathname === '/data/4.0/onecall/timeline/1day') {
        return jsonResponse({
          data: [{ temp: { day: 293.15, night: 283.15 } }],
        });
      }
      if (url.pathname === '/data/4.0/onecall/timeline/1min') {
        return jsonResponse({ data: [{ dt: 1, precipitation: 0 }] });
      }
      throw new Error(`unexpected url ${url.toString()}`);
    });

    const result = JSON.parse(
      await executeOpenWeather(
        { action: 'current_forecast', city: 'Knoxville, Tennessee', units: 'Kelvin' },
        { apiKey, fetch },
      ),
    ) as {
      current: { temp: number; feels_like: number };
      daily: Array<{ temp: { day: number; night: number } }>;
      hourly: Array<{ temp: number }>;
    };

    expect(result.current.temp).toBe(293);
    expect(result.current.feels_like).toBe(295);
    expect(result.daily[0].temp.day).toBe(293);
    expect(result.daily[0].temp.night).toBe(283);
    expect(result.hourly[0].temp).toBe(291);

    const paths = urls.map((url) => new URL(url).pathname);
    expect(paths).toContain('/geo/1.0/direct');
    expect(paths).toContain('/data/4.0/onecall/current');
    expect(paths).toContain('/data/4.0/onecall/timeline/1h');
    expect(paths).toContain('/data/4.0/onecall/timeline/1day');
    expect(paths).toContain('/data/4.0/onecall/timeline/1min');
    expect(urls.some((url) => url.includes('/data/3.0/'))).toBe(false);

    const currentUrl = urls.find((url) => url.includes('/onecall/current'));
    expect(currentUrl).toContain('units=standard');
    expect(currentUrl).toContain('appid=test-api-key');
  });

  it('skips excluded current_forecast parts', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname === '/data/4.0/onecall/current') {
        return jsonResponse({ data: [{ temp: 20 }] });
      }
      throw new Error(`unexpected url ${url.toString()}`);
    });

    const result = JSON.parse(
      await executeOpenWeather(
        {
          action: 'current_forecast',
          lat: 35.96,
          lon: -83.92,
          exclude: 'hourly,daily,minutely',
        },
        { apiKey, fetch },
      ),
    ) as { current: { temp: number }; hourly?: unknown; daily?: unknown; minutely?: unknown };

    expect(result.current.temp).toBe(20);
    expect(result.hourly).toBeUndefined();
    expect(result.daily).toBeUndefined();
    expect(result.minutely).toBeUndefined();
    expect(urls).toHaveLength(1);
    expect(urls[0]).toContain('/data/4.0/onecall/current');
  });

  it('uses timeline/1h with start for timestamp and strips pagination secrets', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname === '/data/4.0/onecall/timeline/1h') {
        return jsonResponse({
          lat: 35.96,
          data: [{ dt: 1583280000, temp: 283.15, feels_like: 280.15 }],
          next: 'https://api.openweathermap.org/data/4.0/onecall/timeline/1h?appid=SECRET&start=2',
        });
      }
      throw new Error(`unexpected url ${url.toString()}`);
    });

    const raw = await executeOpenWeather(
      { action: 'timestamp', lat: 35.96, lon: -83.92, date: '2020-03-04', units: 'Kelvin' },
      { apiKey, fetch },
    );
    const parsed = JSON.parse(raw) as {
      data: Array<{ temp: number; feels_like: number }>;
      next?: string;
    };

    expect(urls[0]).toContain('/data/4.0/onecall/timeline/1h');
    expect(urls[0]).toContain(`start=${1583280000}`);
    expect(parsed.data[0].temp).toBe(283);
    expect(parsed.data[0].feels_like).toBe(280);
    expect(parsed.next).toBeUndefined();
    expect(raw).not.toContain('SECRET');
    expect(raw).not.toContain('appid=');
  });

  it('follows safe hourly next links up to the 48-hour cap', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (!url.pathname.endsWith('/timeline/1h')) {
        return jsonResponse({ data: [] });
      }
      const start = Number(url.searchParams.get('start') ?? '0');
      if (!url.searchParams.has('start')) {
        return jsonResponse({
          data: Array.from({ length: 20 }, (_, i) => ({ dt: i, temp: 10 })),
          next: 'https://api.openweathermap.org/data/4.0/onecall/timeline/1h?start=20&appid=SECRET',
        });
      }
      return jsonResponse({
        data: Array.from({ length: 20 }, (_, i) => ({ dt: start + i, temp: 11 })),
        next: `https://api.openweathermap.org/data/4.0/onecall/timeline/1h?start=${start + 20}&appid=SECRET`,
      });
    });

    const parsed = JSON.parse(
      await executeOpenWeather(
        { action: 'current_forecast', lat: 1, lon: 2, exclude: 'current,daily,minutely' },
        { apiKey, fetch },
      ),
    ) as { hourly: Array<{ dt: number }> };

    expect(parsed.hourly).toHaveLength(48);
    expect(parsed.hourly[0].dt).toBe(0);
    expect(parsed.hourly[47].dt).toBe(47);
    expect(urls.filter((url) => url.includes('/timeline/1h'))).toHaveLength(3);
    expect(JSON.stringify(parsed)).not.toContain('SECRET');
  });

  it('refuses to follow pagination off of api.openweathermap.org', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname.endsWith('/timeline/1h')) {
        return jsonResponse({
          data: [{ dt: 1, temp: 10 }],
          next: 'https://evil.example/data/4.0/onecall/timeline/1h?appid=SECRET',
        });
      }
      return jsonResponse({ data: [] });
    });

    const parsed = JSON.parse(
      await executeOpenWeather(
        { action: 'current_forecast', lat: 1, lon: 2, exclude: 'current,daily,minutely' },
        { apiKey, fetch },
      ),
    ) as { hourly: Array<{ dt: number }> };

    expect(parsed.hourly).toHaveLength(1);
    expect(urls.filter((url) => url.includes('evil.example'))).toHaveLength(0);
  });

  it('maps timeline/1day onto the daily_aggregation contract', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname === '/data/4.0/onecall/timeline/1day') {
        return jsonResponse({
          timezone: 'America/New_York',
          data: [
            {
              dt: 1583280000,
              temp: { morn: 283.15, day: 293.15, eve: 288.15, night: 280 },
            },
          ],
        });
      }
      throw new Error(`unexpected url ${url.toString()}`);
    });

    const parsed = JSON.parse(
      await executeOpenWeather(
        {
          action: 'daily_aggregation',
          lat: 35.96,
          lon: -83.92,
          date: '2020-03-04',
          units: 'Kelvin',
        },
        { apiKey, fetch },
      ),
    ) as { temperature: { morning: number; afternoon: number; evening: number } };

    expect(urls[0]).toContain('/data/4.0/onecall/timeline/1day');
    expect(urls[0]).toContain(`start=${1583280000}`);
    expect(parsed.temperature.morning).toBe(283);
    expect(parsed.temperature.afternoon).toBe(293);
    expect(parsed.temperature.evening).toBe(288);
  });

  it('synthesizes overview from current weather when 4.0 has no overview endpoint', async () => {
    const { fetch, urls } = createFetch((url) => {
      if (url.pathname === '/data/4.0/onecall/current') {
        return jsonResponse({
          lat: 35.9606,
          lon: -83.9207,
          timezone: 'America/New_York',
          data: [
            {
              dt: 1704585600,
              temp: 2,
              feels_like: -2,
              weather: [{ description: 'clear sky' }],
            },
          ],
        });
      }
      throw new Error(`unexpected url ${url.toString()}`);
    });

    const parsed = JSON.parse(
      await executeOpenWeather(
        { action: 'overview', lat: 35.9606, lon: -83.9207, units: 'Celsius' },
        { apiKey, fetch },
      ),
    ) as { weather_overview: string; units: string; date: string };

    expect(urls[0]).toContain('/data/4.0/onecall/current');
    expect(parsed.units).toBe('metric');
    expect(parsed.date).toBe('2024-01-07');
    expect(parsed.weather_overview).toContain('2°C');
    expect(parsed.weather_overview).toContain('-2°C');
    expect(parsed.weather_overview.length).toBeGreaterThan(0);
  });

  it('returns the original error strings for missing dates and missing coordinates', async () => {
    const fetch: OpenWeatherFetcher = async () => {
      throw new Error('fetch should not run');
    };

    expect(
      await executeOpenWeather({ action: 'timestamp', lat: 1, lon: 2 }, { apiKey, fetch }),
    ).toBe("Error: For timestamp action, a 'date' in YYYY-MM-DD format is required.");
    expect(
      await executeOpenWeather({ action: 'daily_aggregation', lat: 1, lon: 2 }, { apiKey, fetch }),
    ).toBe('Error: date (YYYY-MM-DD) is required for daily_aggregation action.');
    expect(await executeOpenWeather({ action: 'current_forecast' }, { apiKey, fetch })).toBe(
      "Error: lat and lon are required and must be numbers for this action (or specify 'city').",
    );
    expect(await executeOpenWeather({ action: 'unknown_action' }, { apiKey, fetch })).toBe(
      'Error: Unknown action: unknown_action',
    );
  });

  it('returns a descriptive error when geocoding finds nothing', async () => {
    const { fetch } = createFetch(() => jsonResponse([]));
    const result = await executeOpenWeather(
      { action: 'current_forecast', city: 'NowhereCity' },
      { apiKey, fetch },
    );
    expect(result).toBe('Error: Could not find coordinates for city: NowhereCity');
  });

  it('returns OpenWeather HTTP failures without calling a live API', async () => {
    const { fetch } = createFetch((url) => {
      if (url.pathname === '/geo/1.0/direct') {
        return jsonResponse(geoBody);
      }
      return jsonResponse({ message: 'Not found' }, 404);
    });

    const result = await executeOpenWeather(
      {
        action: 'current_forecast',
        city: 'Knoxville, Tennessee',
        exclude: 'hourly,daily,minutely',
      },
      { apiKey, fetch },
    );
    expect(result).toBe('Error: OpenWeather API request failed with status 404: Not found');
  });
});
