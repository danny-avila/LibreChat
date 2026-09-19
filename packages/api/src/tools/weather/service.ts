import type {
  CurrentForecastResult,
  DailyAggregationResult,
  OneCallRecord,
  OneCallResponse,
  OpenWeatherArgs,
  OpenWeatherDeps,
  OverviewResult,
} from './types';
import {
  normalizeCurrentForecast,
  normalizeDailyAggregation,
  selectDailyRecord,
  stripPagination,
  synthesizeOverview,
  utcDateString,
} from './normalize';
import { mapUnitsToOpenWeather, roundTemperatures } from './units';

export const OPENWEATHER_API_ORIGIN: string = 'https://api.openweathermap.org';
export const OPEN_WEATHER_TOOL_DESCRIPTION: string =
  'Provides weather data from OpenWeather One Call API 4.0. ' +
  'Actions: help, current_forecast, timestamp, daily_aggregation, overview. ' +
  'If lat/lon not provided, specify "city" for geocoding. ' +
  'Units: "Celsius", "Kelvin", or "Fahrenheit" (default: Celsius). ' +
  'For timestamp action, use "date" in YYYY-MM-DD format.';

const GEOCODE_PATH = '/geo/1.0/direct';
const CURRENT_PATH = '/data/4.0/onecall/current';
const MINUTELY_PATH = '/data/4.0/onecall/timeline/1min';
const HOURLY_PATH = '/data/4.0/onecall/timeline/1h';
const DAILY_PATH = '/data/4.0/onecall/timeline/1day';
const HOURLY_PAGE_LIMIT = 3;
const HOURLY_RECORD_LIMIT = 48;
const HOURLY_PAGE_SIZE = 20;
const DAILY_PAGE_SIZE = 10;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const EXCLUDE_PARTS = new Set(['current', 'minutely', 'hourly', 'daily', 'alerts']);
const COORDINATE_ACTIONS = new Set([
  'current_forecast',
  'timestamp',
  'daily_aggregation',
  'overview',
]);

class OpenWeatherApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OpenWeatherApiError';
    this.status = status;
  }
}

export function getOpenWeatherHelp(): string {
  return JSON.stringify(
    {
      title: 'OpenWeather One Call API 4.0 Help',
      description: 'Guidance on using the OpenWeather One Call API 4.0.',
      endpoints: {
        current_and_forecast: {
          endpoint: 'data/4.0/onecall/current + timeline/1h + timeline/1day + timeline/1min',
          data_provided: [
            'Current weather',
            'Minute forecast (1h)',
            'Hourly forecast (up to 48h, paginated)',
            'Daily forecast (up to 10 days)',
          ],
          required_params: [['lat', 'lon'], ['city']],
          optional_params: ['exclude', 'units (Celsius/Kelvin/Fahrenheit)', 'lang'],
          usage_example: {
            city: 'Knoxville, Tennessee',
            units: 'Fahrenheit',
            lang: 'en',
          },
        },
        weather_for_timestamp: {
          endpoint: 'data/4.0/onecall/timeline/1h',
          data_provided: [
            'Hourly weather around a date (history since 1979, forecast up to 48h ahead)',
          ],
          required_params: [
            ['lat', 'lon', 'date (YYYY-MM-DD)'],
            ['city', 'date (YYYY-MM-DD)'],
          ],
          optional_params: ['units (Celsius/Kelvin/Fahrenheit)', 'lang'],
          usage_example: {
            city: 'Knoxville, Tennessee',
            date: '2020-03-04',
            units: 'Fahrenheit',
            lang: 'en',
          },
        },
        daily_aggregation: {
          endpoint: 'data/4.0/onecall/timeline/1day',
          data_provided: [
            'Daily weather for a specific date (history since 1979, forecast up to 1.5 years ahead)',
          ],
          required_params: [
            ['lat', 'lon', 'date (YYYY-MM-DD)'],
            ['city', 'date (YYYY-MM-DD)'],
          ],
          optional_params: ['units (Celsius/Kelvin/Fahrenheit)', 'lang'],
          usage_example: {
            city: 'Knoxville, Tennessee',
            date: '2020-03-04',
            units: 'Celsius',
            lang: 'en',
          },
        },
        weather_overview: {
          endpoint: 'synthesized from data/4.0/onecall/current or timeline/1day',
          data_provided: [
            'Human-readable weather summary. One Call 4.0 has no overview endpoint, so this is composed from current or daily data.',
          ],
          required_params: [['lat', 'lon'], ['city']],
          optional_params: ['date (YYYY-MM-DD)', 'units (Celsius/Kelvin/Fahrenheit)'],
          usage_example: {
            city: 'Knoxville, Tennessee',
            date: '2024-05-13',
            units: 'Celsius',
          },
        },
      },
      notes: [
        'If lat/lon not provided, you can specify a city name and it will be geocoded.',
        'For the timestamp action, provide a date in YYYY-MM-DD format instead of a Unix timestamp.',
        'By default, temperatures are returned in Celsius.',
        'You can specify units as Celsius, Kelvin, or Fahrenheit.',
        'All temperatures are rounded to the nearest degree.',
        'current_forecast maps 4.0 split endpoints onto the previous current/hourly/daily/minutely contract.',
        'daily_aggregation maps 4.0 daily temp.morn/day/eve/night onto morning/afternoon/evening/night.',
      ],
      errors: [
        '400: Bad Request (missing/invalid params)',
        '401: Unauthorized (check API key)',
        '404: Not Found (no data or city)',
        '429: Too many requests',
        '5xx: Internal error',
      ],
    },
    null,
    2,
  );
}

export function convertDateToUnix(dateStr: string): number {
  if (!DATE_PATTERN.test(dateStr)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }
  const parts = dateStr.split('-');
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD with valid numbers.');
  }

  const dateObj = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  if (isNaN(dateObj.getTime())) {
    throw new Error('Invalid date provided. Cannot parse into a valid date.');
  }

  return Math.floor(dateObj.getTime() / 1000);
}

export function isOpenWeatherPaginationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'api.openweathermap.org' &&
      parsed.pathname.startsWith('/data/4.0/onecall/')
    );
  } catch {
    return false;
  }
}

function isObject(value: unknown): value is { [key: string]: unknown } {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const items = value.filter((item): item is string => typeof item === 'string');
  return items;
}

function parseWeatherCondition(value: unknown): OneCallRecord['weather'] {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const conditions = value.flatMap((item) => {
    if (!isObject(item)) {
      return [];
    }
    return [
      {
        id: asNumber(item.id),
        main: asString(item.main),
        description: asString(item.description),
        icon: asString(item.icon),
      },
    ];
  });
  return conditions;
}

function parsePrecipitation(value: unknown): OneCallRecord['rain'] {
  if (typeof value === 'number') {
    return value;
  }
  if (!isObject(value)) {
    return undefined;
  }
  return { '1h': asNumber(value['1h']) };
}

function parseTemperature(value: unknown): OneCallRecord['temp'] {
  if (typeof value === 'number') {
    return value;
  }
  if (!isObject(value)) {
    return undefined;
  }
  return {
    day: asNumber(value.day),
    min: asNumber(value.min),
    max: asNumber(value.max),
    night: asNumber(value.night),
    eve: asNumber(value.eve),
    morn: asNumber(value.morn),
  };
}

function parseOneCallRecord(value: unknown): OneCallRecord | undefined {
  if (!isObject(value)) {
    return undefined;
  }
  return {
    dt: asNumber(value.dt),
    sunrise: asNumber(value.sunrise),
    sunset: asNumber(value.sunset),
    moonrise: asNumber(value.moonrise),
    moonset: asNumber(value.moonset),
    moon_phase: asNumber(value.moon_phase),
    temp: parseTemperature(value.temp),
    feels_like: parseTemperature(value.feels_like),
    pressure: asNumber(value.pressure),
    humidity: asNumber(value.humidity),
    dew_point: asNumber(value.dew_point),
    uvi: asNumber(value.uvi),
    clouds: asNumber(value.clouds),
    visibility: asNumber(value.visibility),
    wind_speed: asNumber(value.wind_speed),
    wind_deg: asNumber(value.wind_deg),
    wind_gust: asNumber(value.wind_gust),
    pop: asNumber(value.pop),
    precipitation: asNumber(value.precipitation),
    rain: parsePrecipitation(value.rain),
    snow: parsePrecipitation(value.snow),
    weather: parseWeatherCondition(value.weather),
    alerts: asStringArray(value.alerts),
  };
}

function parseOneCallResponse(body: unknown): OneCallResponse {
  if (!isObject(body)) {
    return {};
  }
  const data = Array.isArray(body.data)
    ? body.data.flatMap((item) => {
        const record = parseOneCallRecord(item);
        return record ? [record] : [];
      })
    : undefined;
  return {
    lat: asNumber(body.lat),
    lon: asNumber(body.lon),
    timezone: asString(body.timezone),
    timezone_offset: asNumber(body.timezone_offset),
    data,
    next: asString(body.next),
    prev: asString(body.prev),
  };
}

function readErrorMessage(body: unknown): string {
  if (isObject(body) && typeof body.message === 'string') {
    return body.message;
  }
  try {
    return JSON.stringify(body);
  } catch {
    return 'Unknown error';
  }
}

function parseExclude(exclude?: string): Set<string> {
  if (!exclude) {
    return new Set();
  }
  return new Set(
    exclude
      .split(',')
      .map((part) => part.trim().toLowerCase())
      .filter((part) => EXCLUDE_PARTS.has(part)),
  );
}

function buildUrl(path: string, params: URLSearchParams): string {
  return `${OPENWEATHER_API_ORIGIN}${path}?${params.toString()}`;
}

function locationParams(args: {
  apiKey: string;
  lat: number;
  lon: number;
  units: string;
  lang?: string;
}): URLSearchParams {
  const params = new URLSearchParams({
    appid: args.apiKey,
    units: args.units,
    lat: String(args.lat),
    lon: String(args.lon),
  });
  if (args.lang) {
    params.append('lang', args.lang);
  }
  return params;
}

async function fetchOpenWeatherJson(
  url: string,
  fetchImpl: OpenWeatherDeps['fetch'],
): Promise<OneCallResponse> {
  const response = await fetchImpl(url);
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new OpenWeatherApiError(
      response.status,
      `OpenWeather API request failed with status ${response.status}: ${readErrorMessage(body)}`,
    );
  }
  return parseOneCallResponse(body);
}

async function fetchTimeline(
  path: string,
  params: URLSearchParams,
  fetchImpl: OpenWeatherDeps['fetch'],
  options?: { pages?: number; maxRecords?: number },
): Promise<OneCallResponse> {
  const first = await fetchOpenWeatherJson(buildUrl(path, params), fetchImpl);
  const pageLimit = options?.pages ?? 1;
  const maxRecords = options?.maxRecords;
  const data = [...(first.data ?? [])];
  let next = first.next;
  let pageCount = 1;

  while (
    next &&
    pageCount < pageLimit &&
    (maxRecords == null || data.length < maxRecords) &&
    isOpenWeatherPaginationUrl(next)
  ) {
    const extra = await fetchOpenWeatherJson(next, fetchImpl);
    if (extra.data) {
      data.push(...extra.data);
    }
    next = extra.next;
    pageCount += 1;
  }

  if (maxRecords != null && data.length > maxRecords) {
    data.length = maxRecords;
  }

  return {
    lat: first.lat,
    lon: first.lon,
    timezone: first.timezone,
    timezone_offset: first.timezone_offset,
    data,
  };
}

async function geocodeCity(
  city: string,
  deps: OpenWeatherDeps,
): Promise<{ lat: number; lon: number }> {
  const params = new URLSearchParams({
    q: city,
    limit: '1',
    appid: deps.apiKey,
  });
  const url = buildUrl(GEOCODE_PATH, params);
  const response = await deps.fetch(url);
  const body: unknown = await response.json();
  if (!response.ok || !Array.isArray(body) || body.length === 0) {
    throw new Error(`Could not find coordinates for city: ${city}`);
  }
  const first = body[0];
  if (!isObject(first) || typeof first.lat !== 'number' || typeof first.lon !== 'number') {
    throw new Error(`Could not find coordinates for city: ${city}`);
  }
  return { lat: first.lat, lon: first.lon };
}

function stringifyResult(
  value: CurrentForecastResult | DailyAggregationResult | OverviewResult | OneCallResponse,
): string {
  return JSON.stringify(roundTemperatures(value));
}

async function currentForecast(
  args: OpenWeatherArgs,
  coords: { lat: number; lon: number },
  units: string,
  deps: OpenWeatherDeps,
): Promise<string> {
  const excluded = parseExclude(args.exclude);
  const includeCurrent = !excluded.has('current');
  const includeHourly = !excluded.has('hourly');
  const includeDaily = !excluded.has('daily');
  const includeMinutely = !excluded.has('minutely');
  const params = () =>
    locationParams({
      apiKey: deps.apiKey,
      lat: coords.lat,
      lon: coords.lon,
      units,
      lang: args.lang,
    });

  const currentPromise = includeCurrent
    ? fetchOpenWeatherJson(buildUrl(CURRENT_PATH, params()), deps.fetch)
    : Promise.resolve(undefined);
  const hourlyParams = params();
  hourlyParams.set('cnt', String(HOURLY_PAGE_SIZE));
  const hourlyPromise = includeHourly
    ? fetchTimeline(HOURLY_PATH, hourlyParams, deps.fetch, {
        pages: HOURLY_PAGE_LIMIT,
        maxRecords: HOURLY_RECORD_LIMIT,
      })
    : Promise.resolve(undefined);
  const dailyParams = params();
  dailyParams.set('cnt', String(DAILY_PAGE_SIZE));
  const dailyPromise = includeDaily
    ? fetchTimeline(DAILY_PATH, dailyParams, deps.fetch)
    : Promise.resolve(undefined);
  const minutelyPromise = includeMinutely
    ? fetchOpenWeatherJson(buildUrl(MINUTELY_PATH, params()), deps.fetch)
    : Promise.resolve(undefined);

  const [current, hourly, daily, minutely] = await Promise.all([
    currentPromise,
    hourlyPromise,
    dailyPromise,
    minutelyPromise,
  ]);

  return stringifyResult(normalizeCurrentForecast({ current, hourly, daily, minutely }));
}

async function timestampForecast(
  args: OpenWeatherArgs,
  coords: { lat: number; lon: number },
  units: string,
  deps: OpenWeatherDeps,
): Promise<string> {
  if (!args.date) {
    return "Error: For timestamp action, a 'date' in YYYY-MM-DD format is required.";
  }
  const start = convertDateToUnix(args.date);
  const params = locationParams({
    apiKey: deps.apiKey,
    lat: coords.lat,
    lon: coords.lon,
    units,
    lang: args.lang,
  });
  params.set('start', String(start));
  params.set('cnt', String(HOURLY_PAGE_SIZE));
  const response = await fetchTimeline(HOURLY_PATH, params, deps.fetch);
  return stringifyResult(stripPagination(response));
}

async function dailyAggregation(
  args: OpenWeatherArgs,
  coords: { lat: number; lon: number },
  units: string,
  deps: OpenWeatherDeps,
): Promise<string> {
  if (!args.date) {
    return 'Error: date (YYYY-MM-DD) is required for daily_aggregation action.';
  }
  const start = convertDateToUnix(args.date);
  const params = locationParams({
    apiKey: deps.apiKey,
    lat: coords.lat,
    lon: coords.lon,
    units,
    lang: args.lang,
  });
  params.set('start', String(start));
  params.set('cnt', String(DAILY_PAGE_SIZE));
  const response = await fetchTimeline(DAILY_PATH, params, deps.fetch);
  return stringifyResult(normalizeDailyAggregation(response, args.date, units));
}

async function overviewForecast(
  args: OpenWeatherArgs,
  coords: { lat: number; lon: number },
  units: string,
  deps: OpenWeatherDeps,
): Promise<string> {
  const params = locationParams({
    apiKey: deps.apiKey,
    lat: coords.lat,
    lon: coords.lon,
    units,
    lang: args.lang,
  });

  if (args.date) {
    const start = convertDateToUnix(args.date);
    params.set('start', String(start));
    params.set('cnt', String(DAILY_PAGE_SIZE));
    const daily = await fetchTimeline(DAILY_PATH, params, deps.fetch);
    const record = selectDailyRecord(daily.data ?? [], args.date);
    return stringifyResult(
      synthesizeOverview({
        daily: record,
        date: args.date,
        units,
        lat: daily.lat ?? coords.lat,
        lon: daily.lon ?? coords.lon,
        timezone: daily.timezone,
      }),
    );
  }

  const current = await fetchOpenWeatherJson(buildUrl(CURRENT_PATH, params), deps.fetch);
  const record: OneCallRecord | undefined = current.data?.[0];
  const date =
    record?.dt != null ? utcDateString(record.dt) : utcDateString(Math.floor(Date.now() / 1000));
  return stringifyResult(
    synthesizeOverview({
      current: record,
      date,
      units,
      lat: current.lat ?? coords.lat,
      lon: current.lon ?? coords.lon,
      timezone: current.timezone,
    }),
  );
}

export async function executeOpenWeather(
  args: OpenWeatherArgs,
  deps: OpenWeatherDeps,
): Promise<string> {
  try {
    const { action, city, lat, lon, units } = args;
    const owmUnits = mapUnitsToOpenWeather(units);

    if (action === 'help') {
      return getOpenWeatherHelp();
    }

    if (!COORDINATE_ACTIONS.has(action)) {
      return `Error: Unknown action: ${action}`;
    }

    let finalLat = lat;
    let finalLon = lon;
    if ((finalLat == null || finalLon == null) && city) {
      const coords = await geocodeCity(city, deps);
      finalLat = coords.lat;
      finalLon = coords.lon;
    }

    if (typeof finalLat !== 'number' || typeof finalLon !== 'number') {
      return "Error: lat and lon are required and must be numbers for this action (or specify 'city').";
    }

    const coords = { lat: finalLat, lon: finalLon };

    switch (action) {
      case 'current_forecast':
        return await currentForecast(args, coords, owmUnits, deps);
      case 'timestamp':
        return await timestampForecast(args, coords, owmUnits, deps);
      case 'daily_aggregation':
        return await dailyAggregation(args, coords, owmUnits, deps);
      case 'overview':
        return await overviewForecast(args, coords, owmUnits, deps);
      default:
        return `Error: Unknown action: ${action}`;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return `Error: ${message}`;
  }
}
