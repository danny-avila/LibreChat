import type {
  CurrentForecastResult,
  DailyAggregationResult,
  DailyTemperature,
  OneCallRecord,
  OneCallResponse,
  OverviewResult,
} from './types';

import { unitSuffix } from './units';

export function isDailyTemperature(value: OneCallRecord['temp']): value is DailyTemperature {
  return value != null && typeof value === 'object';
}

export function utcDateString(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function stripPagination(response: OneCallResponse): OneCallResponse {
  return {
    lat: response.lat,
    lon: response.lon,
    timezone: response.timezone,
    timezone_offset: response.timezone_offset,
    data: response.data,
  };
}

export function normalizeCurrentForecast(parts: {
  current?: OneCallResponse;
  hourly?: OneCallResponse;
  daily?: OneCallResponse;
  minutely?: OneCallResponse;
}): CurrentForecastResult {
  const meta = parts.current ?? parts.hourly ?? parts.daily ?? parts.minutely;
  const result: CurrentForecastResult = {
    lat: meta?.lat,
    lon: meta?.lon,
    timezone: meta?.timezone,
    timezone_offset: meta?.timezone_offset,
  };

  if (parts.current?.data?.[0] != null) {
    result.current = parts.current.data[0];
  }
  if (parts.minutely?.data != null) {
    result.minutely = parts.minutely.data;
  }
  if (parts.hourly?.data != null) {
    result.hourly = parts.hourly.data;
  }
  if (parts.daily?.data != null) {
    result.daily = parts.daily.data;
  }

  return result;
}

export function selectDailyRecord(
  records: OneCallRecord[],
  requestedDate: string,
): OneCallRecord | undefined {
  const matched = records.find(
    (record) => typeof record.dt === 'number' && utcDateString(record.dt) === requestedDate,
  );
  return matched ?? records[0];
}

function precipitationTotal(record?: OneCallRecord): number | undefined {
  if (record == null) {
    return undefined;
  }
  if (typeof record.rain === 'number') {
    return record.rain;
  }
  if (record.rain && typeof record.rain['1h'] === 'number') {
    return record.rain['1h'];
  }
  if (typeof record.snow === 'number') {
    return record.snow;
  }
  if (record.snow && typeof record.snow['1h'] === 'number') {
    return record.snow['1h'];
  }
  return undefined;
}

export function normalizeDailyAggregation(
  response: OneCallResponse,
  requestedDate: string,
  units: string,
): DailyAggregationResult {
  const record = selectDailyRecord(response.data ?? [], requestedDate);
  const temp = isDailyTemperature(record?.temp) ? record.temp : undefined;

  return {
    lat: response.lat,
    lon: response.lon,
    tz: response.timezone,
    date: requestedDate,
    units,
    cloud_cover: { afternoon: record?.clouds },
    humidity: {
      morning: record?.humidity,
      afternoon: record?.humidity,
      evening: record?.humidity,
      night: record?.humidity,
    },
    precipitation: { total: precipitationTotal(record) },
    temperature: {
      min: temp?.min,
      max: temp?.max,
      morning: temp?.morn,
      afternoon: temp?.day,
      evening: temp?.eve,
      night: temp?.night,
    },
    pressure: { afternoon: record?.pressure },
    wind: {
      max: {
        speed: record?.wind_speed,
        direction: record?.wind_deg,
      },
    },
  };
}

function formatOverviewFromCurrent(record: OneCallRecord, units: string): string | undefined {
  if (typeof record.temp !== 'number') {
    return undefined;
  }
  const suffix = unitSuffix(units);
  const feels =
    typeof record.feels_like === 'number'
      ? ` with a real feel of ${record.feels_like}${suffix}`
      : '';
  const description = record.weather?.[0]?.description;
  const sky = description ? ` The sky is ${description}.` : '';
  return `Currently, the temperature is ${record.temp}${suffix}${feels}.${sky}`.trim();
}

function formatOverviewFromDaily(record: OneCallRecord, units: string): string | undefined {
  if (!isDailyTemperature(record.temp)) {
    return undefined;
  }
  const suffix = unitSuffix(units);
  const min = record.temp.min;
  const max = record.temp.max;
  const description = record.weather?.[0]?.description;
  const sky = description ? ` ${description.charAt(0).toUpperCase()}${description.slice(1)}.` : '';
  if (typeof min === 'number' && typeof max === 'number') {
    return `Temperatures range from ${min}${suffix} to ${max}${suffix}.${sky}`.trim();
  }
  if (typeof record.temp.day === 'number') {
    return `The daytime temperature is ${record.temp.day}${suffix}.${sky}`.trim();
  }
  return undefined;
}

export function synthesizeOverview(params: {
  current?: OneCallRecord;
  daily?: OneCallRecord;
  date: string;
  units: string;
  lat?: number;
  lon?: number;
  timezone?: string;
}): OverviewResult {
  const weather_overview =
    (params.current != null
      ? formatOverviewFromCurrent(params.current, params.units)
      : undefined) ??
    (params.daily != null ? formatOverviewFromDaily(params.daily, params.units) : undefined) ??
    'Weather overview is unavailable for this location.';

  return {
    lat: params.lat,
    lon: params.lon,
    tz: params.timezone,
    date: params.date,
    units: params.units,
    weather_overview,
  };
}
