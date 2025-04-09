/**
 * TimeAPI Plugin
 * 
 * Implements the TimeAPI.io endpoints as a LangChain Tool.
 * 
 * - GET current time by zone/coordinate/ip
 * - GET available time zones
 * - GET time zone info by zone/coordinate/ip
 * - POST convert time zone
 * - POST translate date/time
 * - GET day of week
 * - GET day of year
 * - POST increment/decrement time
 * - Health check
 * - And includes a 'help' action returning usage instructions.
 * 
 */

const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const fetch = require('node-fetch');

// Utility to safely build query strings
function buildQueryString(params) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, val]) => {
    if (val !== undefined && val !== null && val !== '') {
      query.set(key, String(val));
    }
  });
  return query.toString();
}

class TimeAPI extends Tool {
  // The name and description are used by the model to determine
  // when to call this tool and with which arguments.
  name = 'time_api';
  description = `Provides time and time zone data, conversions, translations, 
  date-of-week/year lookups, and day/time arithmetic. Actions:
  'help', 'get_current_time_zone', 'get_current_time_coordinate', 'get_current_time_ip',
  'list_timezones', 'get_timezone_info_by_zone', 'get_timezone_info_by_coordinate',
  'get_timezone_info_by_ip', 'convert_timezone', 'translate_time', 'get_day_of_week',
  'get_day_of_year', 'increment_current_time', 'decrement_current_time',
  'increment_custom_time', 'decrement_custom_time', 'health_check'.
  No API key required.`;

  /**
   * For structured arguments, define your zod schema:
   * `action` is an enum of possible endpoints.
   */
  schema = z.object({
    action: z.enum([
      'help',
      'get_current_time_zone',
      'get_current_time_coordinate',
      'get_current_time_ip',
      'list_timezones',
      'get_timezone_info_by_zone',
      'get_timezone_info_by_coordinate',
      'get_timezone_info_by_ip',
      'convert_timezone',
      'translate_time',
      'get_day_of_week',
      'get_day_of_year',
      'increment_current_time',
      'decrement_current_time',
      'increment_custom_time',
      'decrement_custom_time',
      'health_check',
    ]),

    // GET /api/time/current/zone
    timeZone: z.string().optional(), // used in multiple places

    // GET /api/time/current/coordinate
    latitude: z.number().optional(),
    longitude: z.number().optional(),

    // GET /api/time/current/ip
    ipAddress: z.string().optional(),

    // POST /api/conversion/converttimezone
    fromTimeZone: z.string().optional(),
    dateTime: z.string().optional(),
    toTimeZone: z.string().optional(),
    dstAmbiguity: z.string().optional(),

    // POST /api/conversion/translate
    languageCode: z.string().optional(),

    // GET /api/conversion/dayoftheweek/{date}
    // GET /api/conversion/dayoftheyear/{date}
    date: z.string().optional(),

    // For increment/decrement current time
    // POST /api/calculation/current/increment
    // POST /api/calculation/current/decrement
    timeSpan: z.string().optional(),

    // For increment/decrement custom time
    // POST /api/calculation/custom/increment
    // POST /api/calculation/custom/decrement
    // => uses dateTime, timeZone, timeSpan, dstAmbiguity
  });

  constructor(fields = {}) {
    super();
    // No API key is needed for TimeAPI.io. 
    // Optionally any extra config can go here if needed.
  }

  /**
   * The main method that the agent calls
   */
  async _call(args) {
    const {
      action,
      timeZone,
      latitude,
      longitude,
      ipAddress,
      fromTimeZone,
      dateTime,
      toTimeZone,
      dstAmbiguity,
      languageCode,
      date,
      timeSpan,
    } = args;

    // A small helper to handle text-based error returns:
    function errorReturn(msg) {
      return `Error: ${msg}`;
    }

    // The base URL for all TimeAPI endpoints:
    const baseUrl = 'https://timeapi.io';

    try {
      switch (action) {
        /**
         * HELP
         */
        case 'help':
          // Provide a detailed JSON about each endpoint, usage, required params, examples, etc.
          return JSON.stringify(
            {
              title: 'TimeAPI',
              description:
                'Time and time zone data, conversions, translations, date-of-week/year, time arithmetic, and health check.' +
                'PLEASE run the help action to see all available endpoints and their required parameters BEFORE calling the API.' +
                'Thanks!',
              endpoints: {
                get_current_time_zone: {
                  method: 'GET',
                  route: '/api/time/current/zone?timeZone=YourIANAZone',
                  required_params: ['timeZone'],
                  example: { timeZone: 'Europe/Amsterdam' },
                },
                get_current_time_coordinate: {
                  method: 'GET',
                  route: '/api/time/current/coordinate?latitude=..&longitude=..',
                  required_params: ['latitude', 'longitude'],
                  example: { latitude: 38.9, longitude: -77.03 },
                },
                get_current_time_ip: {
                  method: 'GET',
                  route: '/api/time/current/ip?ipAddress=YourIpAddress',
                  required_params: ['ipAddress'],
                  example: { ipAddress: '237.71.232.203' },
                },
                list_timezones: {
                  method: 'GET',
                  route: '/api/timezone/availabletimezones',
                  required_params: [],
                  example: {},
                },
                get_timezone_info_by_zone: {
                  method: 'GET',
                  route: '/api/timezone/zone?timeZone=YourIANAZone',
                  required_params: ['timeZone'],
                  example: { timeZone: 'Europe/Amsterdam' },
                },
                get_timezone_info_by_coordinate: {
                  method: 'GET',
                  route: '/api/timezone/coordinate?latitude=..&longitude=..',
                  required_params: ['latitude', 'longitude'],
                  example: { latitude: 38.9, longitude: -77.03 },
                },
                get_timezone_info_by_ip: {
                  method: 'GET',
                  route: '/api/timezone/ip?ipAddress=YourIpAddress',
                  required_params: ['ipAddress'],
                  example: { ipAddress: '237.71.232.203' },
                },
                convert_timezone: {
                  method: 'POST',
                  route: '/api/conversion/converttimezone',
                  required_params: ['fromTimeZone', 'dateTime', 'toTimeZone'],
                  optional_params: ['dstAmbiguity'],
                  body_schema: {
                    fromTimeZone: 'string',
                    dateTime: 'YYYY-MM-DD HH:mm:ss',
                    toTimeZone: 'string',
                    dstAmbiguity: 'string (optional)',
                  },
                },
                translate_time: {
                  method: 'POST',
                  route: '/api/conversion/translate',
                  required_params: ['dateTime', 'languageCode'],
                  body_schema: {
                    dateTime: 'YYYY-MM-DD HH:mm:ss',
                    languageCode: 'ISO 639-1 code (e.g. "de", "en", "fr")',
                  },
                },
                get_day_of_week: {
                  method: 'GET',
                  route: '/api/conversion/dayoftheweek/{date}',
                  required_params: ['date (YYYY-MM-DD)'],
                },
                get_day_of_year: {
                  method: 'GET',
                  route: '/api/conversion/dayoftheyear/{date}',
                  required_params: ['date (YYYY-MM-DD)'],
                },
                increment_current_time: {
                  method: 'POST',
                  route: '/api/calculation/current/increment',
                  required_params: ['timeZone', 'timeSpan'],
                  example: {
                    timeZone: 'Europe/Amsterdam',
                    timeSpan: 'd:hh:mm:ss (e.g. 16:03:45:17)',
                  },
                },
                decrement_current_time: {
                  method: 'POST',
                  route: '/api/calculation/current/decrement',
                  required_params: ['timeZone', 'timeSpan'],
                },
                increment_custom_time: {
                  method: 'POST',
                  route: '/api/calculation/custom/increment',
                  required_params: ['timeZone', 'dateTime', 'timeSpan'],
                  optional_params: ['dstAmbiguity'],
                },
                decrement_custom_time: {
                  method: 'POST',
                  route: '/api/calculation/custom/decrement',
                  required_params: ['timeZone', 'dateTime', 'timeSpan'],
                  optional_params: ['dstAmbiguity'],
                },
                health_check: {
                  method: 'GET',
                  route: '/api/health/check',
                },
              },
              notes: ['No API key required for timeapi.io.'],
              errors: [
                '400: Bad Request (missing/invalid params)',
                '404: Not Found',
                '5xx: Internal Server Error, etc.',
              ],
            },
            null,
            2,
          );

        /**
         * GET /api/time/current/zone
         */
        case 'get_current_time_zone': {
          if (!timeZone) {
            return errorReturn('Missing required "timeZone" parameter.');
          }
          const qs = buildQueryString({ timeZone });
          const url = `${baseUrl}/api/time/current/zone?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text(); // return raw JSON string
        }

        /**
         * GET /api/time/current/coordinate
         */
        case 'get_current_time_coordinate': {
          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return errorReturn('Missing or invalid "latitude" and/or "longitude".');
          }
          const qs = buildQueryString({ latitude, longitude });
          const url = `${baseUrl}/api/time/current/coordinate?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/time/current/ip
         */
        case 'get_current_time_ip': {
          if (!ipAddress) {
            return errorReturn('Missing "ipAddress" parameter.');
          }
          const qs = buildQueryString({ ipAddress });
          const url = `${baseUrl}/api/time/current/ip?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/timezone/availabletimezones
         */
        case 'list_timezones': {
          const url = `${baseUrl}/api/timezone/availabletimezones`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/timezone/zone
         */
        case 'get_timezone_info_by_zone': {
          if (!timeZone) {
            return errorReturn('Missing required "timeZone" parameter.');
          }
          const qs = buildQueryString({ timeZone });
          const url = `${baseUrl}/api/timezone/zone?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/timezone/coordinate
         */
        case 'get_timezone_info_by_coordinate': {
          if (typeof latitude !== 'number' || typeof longitude !== 'number') {
            return errorReturn('Missing or invalid "latitude" and/or "longitude".');
          }
          const qs = buildQueryString({ latitude, longitude });
          const url = `${baseUrl}/api/timezone/coordinate?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/timezone/ip
         */
        case 'get_timezone_info_by_ip': {
          if (!ipAddress) {
            return errorReturn('Missing "ipAddress" parameter.');
          }
          const qs = buildQueryString({ ipAddress });
          const url = `${baseUrl}/api/timezone/ip?${qs}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/conversion/converttimezone
         */
        case 'convert_timezone': {
          if (!fromTimeZone || !dateTime || !toTimeZone) {
            return errorReturn(
              'Missing required fields. Must include "fromTimeZone", "dateTime", and "toTimeZone".',
            );
          }
          const url = `${baseUrl}/api/conversion/converttimezone`;
          const body = {
            fromTimeZone,
            dateTime,
            toTimeZone,
            dstAmbiguity: dstAmbiguity || '',
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/conversion/translate
         */
        case 'translate_time': {
          if (!dateTime || !languageCode) {
            return errorReturn(
              'Missing required fields. Must include "dateTime" and "languageCode".',
            );
          }
          const url = `${baseUrl}/api/conversion/translate`;
          const body = {
            dateTime,
            languageCode,
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/conversion/dayoftheweek/{date}
         */
        case 'get_day_of_week': {
          if (!date) {
            return errorReturn('Missing required "date" parameter (YYYY-MM-DD).');
          }
          const url = `${baseUrl}/api/conversion/dayoftheweek/${encodeURIComponent(date)}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/conversion/dayoftheyear/{date}
         */
        case 'get_day_of_year': {
          if (!date) {
            return errorReturn('Missing required "date" parameter (YYYY-MM-DD).');
          }
          const url = `${baseUrl}/api/conversion/dayoftheyear/${encodeURIComponent(date)}`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/calculation/current/increment
         */
        case 'increment_current_time': {
          if (!timeZone || !timeSpan) {
            return errorReturn('Missing "timeZone" or "timeSpan".');
          }
          const url = `${baseUrl}/api/calculation/current/increment`;
          const body = {
            timeZone,
            timeSpan,
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/calculation/current/decrement
         */
        case 'decrement_current_time': {
          if (!timeZone || !timeSpan) {
            return errorReturn('Missing "timeZone" or "timeSpan".');
          }
          const url = `${baseUrl}/api/calculation/current/decrement`;
          const body = {
            timeZone,
            timeSpan,
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/calculation/custom/increment
         */
        case 'increment_custom_time': {
          if (!timeZone || !dateTime || !timeSpan) {
            return errorReturn('Missing "timeZone", "dateTime", or "timeSpan".');
          }
          const url = `${baseUrl}/api/calculation/custom/increment`;
          const body = {
            timeZone,
            dateTime,
            timeSpan,
            dstAmbiguity: dstAmbiguity || '',
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * POST /api/calculation/custom/decrement
         */
        case 'decrement_custom_time': {
          if (!timeZone || !dateTime || !timeSpan) {
            return errorReturn('Missing "timeZone", "dateTime", or "timeSpan".');
          }
          const url = `${baseUrl}/api/calculation/custom/decrement`;
          const body = {
            timeZone,
            dateTime,
            timeSpan,
            dstAmbiguity: dstAmbiguity || '',
          };
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return await res.text();
        }

        /**
         * GET /api/health/check
         */
        case 'health_check': {
          const url = `${baseUrl}/api/health/check`;
          const res = await fetch(url);
          if (!res.ok) {
            return `Error: status ${res.status} - ${await res.text()}`;
          }
          return `Success: status ${res.status}`;
        }

        default:
          return errorReturn(`Unknown action: ${action}`);
      }
    } catch (err) {
      // Return error text (rather than throw) so the LLM sees it
      return `Error: ${err.message}`;
    }
  }
}

module.exports = TimeAPI;
