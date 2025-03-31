/**
 * QuickChartAPI Tool for LibreChat - now with explicit time series, smoothing (lineTension),
 * and rounded bars support!
 *
 * This plugin integrates with quickchart.io. It supports structured inputs for:
 *   - chartConfig: the base Chart.js config (stringified JSON)
 *   - title: chart title
 *   - showGridLines: toggle grid lines
 *   - xAxisLabel, yAxisLabel: axis labels
 *   - beginAtZero: force Y axis start at 0
 *   - labels: boolean to toggle data labels
 *   - legend: object to configure legend (display, position, align)
 *   - chartBackgroundColor: string for the entire chart's background color
 *   - backgroundImageUrl: string for custom chart background image
 *   - datasetColors: array of color objects to apply to each dataset
 *   - globalPointStyle: object to set global point styling
 *   - datasetPointStyle: array of objects for per-dataset point styling
 *   - datasetLineStyle: array of objects for per-dataset line styling
 *   - timeAxis: object that enables time series on the X axis, with optional parser and other config
 *   - globalLineTension: number to set lineTension on all line datasets (global smoothing)
 *   - roundedBars: object to enable/disable bar rounding, plus cornerRadius
 *   - neverExpire: boolean, if false, the template expires in 6 months

 */

const { Tool } = require('@langchain/core/tools');
const { z } = require('zod');
const fetch = require('node-fetch');

const QUICKCHART_BASE_URL_ORIG = 'https://quickchart.io';

class Quickchart extends Tool {
  constructor(fields = {}) {
    super();
    // Check to see if QUICKCHART_BASE_URL is set in the fields or environment
    // If it is, use that as the base URL for the QuickChart API
    // Otherwise, use the default base URL
    this.baseUrl = this._initializeField(
      fields.QUICKCHART_BASE_URL,
      'QUICKCHART_BASE_URL',
      QUICKCHART_BASE_URL_ORIG,
    );
    this.name = 'quickchart';
    this.description =
      'Generate charts via QuickChart.io. Actions: "help" or "create_chart". ' +
      'Supports optional fields for chart title, grid lines, axes, data labels, legend, ' +
      'colors/background, point style, line style, time series, smoothing, and rounded bars.' +
      'Be sure to embed all charts as markdown images in the response. Run with "action=help:" before generating charts for the first time.'  +
      'ALWAYS embed the chart as a markdown image in the response.';

    // Extended schema for smoothing (globalLineTension) and roundedBars:
    this.schema = z.object({
      action: z
        .enum(['help', 'create_chart'])
        .describe('Either "help" for usage instructions, or "create_chart" to build a chart.'),

      chartConfig: z
        .string()
        .optional()
        .describe(
          'Stringified JSON describing Chart.js configuration (required if action=create_chart).',
        ),

      title: z.string().optional().describe('Optional chart title text'),
      showGridLines: z.boolean().optional().describe('Toggle grid lines on/off (default off)'),
      xAxisLabel: z.string().optional().describe('Optional X-axis label'),
      yAxisLabel: z.string().optional().describe('Optional Y-axis label'),
      beginAtZero: z.boolean().optional().describe('Force Y axis to start at 0 (default false)'),
      labels: z
        .boolean()
        .optional()
        .describe(
          'If true, enable Chart.js Data Labels plugin with default configuration so data values are shown.',
        ),
      legend: z
        .object({
          display: z.boolean().optional(),
          position: z.enum(['top', 'left', 'bottom', 'right']).optional(),
          align: z.enum(['start', 'center', 'end']).optional(),
        })
        .optional()
        .describe('Optional legend configuration (display, position, align)'),

      chartBackgroundColor: z
        .string()
        .optional()
        .describe('Set the entire chart background color, e.g. "#fff", "rgba(255,0,0,0.5)", etc.'),
      backgroundImageUrl: z
        .string()
        .optional()
        .describe(
          'URL for custom chart background image (placed in options.plugins.backgroundImageUrl).',
        ),
      datasetColors: z
        .array(
          z.object({
            backgroundColor: z.string().optional(),
            borderColor: z.string().optional(),
          }),
        )
        .optional()
        .describe(
          'Array of color objects to apply to each dataset in order. ' +
            'For example: [{"backgroundColor":"red","borderColor":"darkred"}, ...]',
        ),

      // Global point style (applies to chartObj.options.elements.point)
      globalPointStyle: z
        .object({
          backgroundColor: z.string().optional(),
          borderColor: z.string().optional(),
          borderWidth: z.number().optional(),
          radius: z.number().optional(),
          rotation: z.number().optional(),
          pointStyle: z.string().optional(),
        })
        .optional()
        .describe(
          'Global point styling for line/radar/bubble charts. E.g. {"pointStyle":"star","radius":8,"borderColor":"#333"}',
        ),

      // Dataset-level point style array
      datasetPointStyle: z
        .array(
          z.object({
            pointStyle: z.string().optional(),
            pointRadius: z.number().optional(),
            pointBorderWidth: z.number().optional(),
            pointRotation: z.number().optional(),
            pointBackgroundColor: z.string().optional(),
            pointBorderColor: z.string().optional(),
          }),
        )
        .optional()
        .describe(
          'An array of per-dataset point styles. Each object can specify `pointStyle`, `pointRadius`, `pointBorderWidth`, `pointRotation`, etc.',
        ),

      // Dataset-level line style array
      datasetLineStyle: z
        .array(
          z.object({
            backgroundColor: z.string().optional(),
            borderCapStyle: z.string().optional(),
            borderColor: z.string().optional(),
            borderDash: z.array(z.number()).optional(),
            borderDashOffset: z.number().optional(),
            borderJoinStyle: z.string().optional(),
            borderWidth: z.number().optional(),
            clip: z
              .union([
                z.number(),
                z.object({
                  left: z.number().optional(),
                  right: z.number().optional(),
                  top: z.number().optional(),
                  bottom: z.number().optional(),
                }),
              ])
              .optional(),
            fill: z.boolean().optional(),
            lineTension: z.number().optional(),
            showLine: z.boolean().optional(),
            spanGaps: z.boolean().optional(),
            steppedLine: z.union([z.boolean(), z.enum(['before', 'after', 'middle'])]).optional(),
          }),
        )
        .optional()
        .describe(
          'Array of line style objects to apply to each dataset in order. ' +
            'For example: [{"borderDash":[5,5],"borderWidth":2,"lineTension":0.4,"steppedLine":false}, ...]',
        ),

      // Time-axis support
      timeAxis: z
        .object({
          enabled: z.boolean().optional(),
          parser: z.string().optional(),
          unit: z
            .enum([
              'millisecond',
              'second',
              'minute',
              'hour',
              'day',
              'week',
              'month',
              'quarter',
              'year',
            ])
            .optional()
            .describe('Forces the axis to use that specific time unit.'),
          minUnit: z
            .enum([
              'millisecond',
              'second',
              'minute',
              'hour',
              'day',
              'week',
              'month',
              'quarter',
              'year',
            ])
            .optional()
            .describe('The minimum unit of time to display.'),
          stepSize: z.number().optional().describe('Number of units between grid lines'),
          isoWeekday: z.boolean().optional().describe('If true, set first day of week to Monday'),
          round: z
            .enum([
              'millisecond',
              'second',
              'minute',
              'hour',
              'day',
              'week',
              'month',
              'quarter',
              'year',
            ])
            .optional()
            .describe(
              'If set, dates will be rounded to the start of this unit (e.g. day => start of day).',
            ),
          displayFormats: z
            .record(z.string())
            .optional()
            .describe(
              'Object defining custom display format strings for each time unit. E.g. {"day":"MMM DD YYYY"}',
            ),
        })
        .optional(),

      // Global line tension (smoothing) that we can apply to all line datasets
      globalLineTension: z
        .number()
        .optional()
        .describe('If set, apply this lineTension to all line-type datasets for smoothing.'),

      // Rounding edges for bar charts
      roundedBars: z
        .object({
          enabled: z.boolean().optional(),
          cornerRadius: z.number().optional(),
        })
        .optional(),
    });
    if (this.baseUrl !== QUICKCHART_BASE_URL_ORIG) {
      this.schema = this.schema.extend({
        neverExpire: z.boolean().optional().describe('If false, the template expires in 6 months'),
      });
      this.description += 'ALWAYS use neverExpire=true if there are no expiration requirements';
    }
  }

  // Helper function for initializing properties
  _initializeField(field, envVar, defaultValue) {
    return field || process.env[envVar] || defaultValue;
  }

  async _call(args) {
    const { action } = args;
    if (action === 'help') {
      return this.getHelpMessage();
    }
    if (action === 'create_chart') {
      return this.createChart(args);
    }
    return 'Error: unknown action. Use "help" or "create_chart".';
  }

  /**
   * Provide an extended help message that references QuickChart docs including
   * time-series, smoothing, and rounding edges (roundedBars).
   */
  getHelpMessage() {
    return `
**QuickChart Usage Help** 
(Title / Grid / Axes / Labels / Legend / Colors / Point Style / Line Style / Time Series / Smoothing / Rounded Bars)

Use \`action = "help"\` for this message, or \`action = "create_chart"\` to build a chart.

**Structured Input** (JSON):
\`\`\`json
{
  "action": "create_chart",
  "chartConfig": "{...}",           // required Chart.js config (stringified)
  "title": "Some Title Here",
  "showGridLines": true,
  "xAxisLabel": "Horizontal Axis",
  "yAxisLabel": "Vertical Axis",
  "beginAtZero": true,
  "labels": true,
  "legend": {
    "display": true,
    "position": "right",
    "align": "start"
  },
  "chartBackgroundColor": "white",
  "backgroundImageUrl": "https://example.com/foo.jpg",
  "datasetColors": [
    { "backgroundColor": "red", "borderColor": "darkred" },
    { "backgroundColor": "#ccc", "borderColor": "#333" }
  ],
  "globalPointStyle": {
    "pointStyle": "circle",
    "radius": 6,
    "borderColor": "#888"
  },
  "datasetPointStyle": [
    {
      "pointStyle": "star",
      "pointRadius": 10,
      "pointBackgroundColor": "yellow",
      "pointBorderColor": "orange"
    }
  ],
  "datasetLineStyle": [
    {
      "borderDash": [5, 5],
      "borderWidth": 2,
      "lineTension": 0.4,
      "steppedLine": false
    }
  ],
  "timeAxis": {
    "enabled": true,
    "parser": "YYYY-MM-DD",
    "unit": "day",
    "displayFormats": {
      "day": "MMM DD"
    }
  },
  "globalLineTension": 0.3,
  "roundedBars": {
    "enabled": true,
    "cornerRadius": 15
  },
  "neverExpire": true
}
\`\`\`

**Smoothing (Line Charts)**:
- You can enable per-dataset smoothing by setting \`lineTension\` inside \`datasetLineStyle\`.
- Or use \`globalLineTension\` to apply the same \`lineTension\` to all line-type datasets.

**Rounded Bar Edges**:
- Set \`roundedBars.enabled = true\` to enable the built-in rounding plugin for bar charts.
- Optionally set \`roundedBars.cornerRadius\` (pixels). Example:
\`\`\`json
"roundedBars": {
  "enabled": true,
  "cornerRadius": 20
}
\`\`\`

${this.baseUrl === QUICKCHART_BASE_URL_ORIG ? '' : '**Chart template expiration**\n- Set `neverExpire` to false if you want the schedule to expire in 6 months\n- Set `neverExpire` to true if you want the schedule to never expire'}

**Reference**:
- [Chart Title Docs](https://quickchart.io/documentation/#chart-title)
- [Grid Lines Docs](https://quickchart.io/documentation/#grid-lines)
- [Axes Docs](https://quickchart.io/documentation/#axes)
- [Labels/Data Labels Docs](https://quickchart.io/documentation/#labels)
- [Legend Docs](https://quickchart.io/documentation/#legend)
- [Colors & Background Docs](https://quickchart.io/documentation/reference/colors-and-backgrounds/)
- [Point Style Docs](https://quickchart.io/documentation/reference/point-style/)
- [Line Style Docs](https://quickchart.io/documentation/reference/line-style/)
- [Time Series Docs](https://quickchart.io/documentation/reference/time-series/)
- [Smoothing & Rounding Docs](https://quickchart.io/documentation/reference/smoothing-and-rounding/)

Enjoy!
`;
  }

  /**
   * create_chart merges optional Title, Gridlines, Axes, Data Labels, Legend,
   * background/image colors, dataset colors, point/line styling, time-axis usage,
   * rounding bars, and global line smoothing into the user-provided chartConfig,
   * then calls QuickChart for a short URL.
   */
  async createChart(args) {
    const {
      chartConfig,
      title,
      showGridLines = false,
      xAxisLabel,
      yAxisLabel,
      beginAtZero = false,
      labels = false,
      legend,
      chartBackgroundColor,
      backgroundImageUrl,
      datasetColors,
      globalPointStyle,
      datasetPointStyle,
      datasetLineStyle,
      timeAxis,
      globalLineTension,
      roundedBars,
      neverExpire = false,
    } = args;

    if (!chartConfig) {
      return 'Error: chartConfig is required for action=create_chart.';
    }

    // Parse the user-provided JSON config
    let chartObj;
    try {
      chartObj = JSON.parse(chartConfig);
    } catch (err) {
      return `Error: invalid JSON in chartConfig. ${err.message}`;
    }

    // Ensure chartObj.options and chartObj.options.plugins exist
    if (!chartObj.options) {
      chartObj.options = {};
    }
    if (!chartObj.options.plugins) {
      chartObj.options.plugins = {};
    }

    // 1) Chart Title
    if (title) {
      chartObj.options.plugins.title = {
        display: true,
        text: title,
      };
    }

    // 2) Grid Lines
    if (!chartObj.options.scales) {
      chartObj.options.scales = {};
    }
    if (!chartObj.options.scales.x) {
      chartObj.options.scales.x = {};
    }
    if (!chartObj.options.scales.y) {
      chartObj.options.scales.y = {};
    }
    if (!chartObj.options.scales.x.grid) {
      chartObj.options.scales.x.grid = {};
    }
    if (!chartObj.options.scales.y.grid) {
      chartObj.options.scales.y.grid = {};
    }
    chartObj.options.scales.x.grid.display = !!showGridLines;
    chartObj.options.scales.y.grid.display = !!showGridLines;

    // 3) Axis Labels
    if (xAxisLabel) {
      if (!chartObj.options.scales.x.title) {
        chartObj.options.scales.x.title = {};
      }
      chartObj.options.scales.x.title.display = true;
      chartObj.options.scales.x.title.text = xAxisLabel;
    }
    if (yAxisLabel) {
      if (!chartObj.options.scales.y.title) {
        chartObj.options.scales.y.title = {};
      }
      chartObj.options.scales.y.title.display = true;
      chartObj.options.scales.y.title.text = yAxisLabel;
    }

    // 4) beginAtZero
    if (beginAtZero) {
      if (!chartObj.options.scales.y.ticks) {
        chartObj.options.scales.y.ticks = {};
      }
      chartObj.options.scales.y.ticks.beginAtZero = true;
    }

    // 5) Data Labels
    if (labels) {
      chartObj.options.plugins.datalabels = {
        anchor: 'end',
        align: 'top',
        color: '#444',
        font: {
          weight: 'bold',
        },
      };
    } else {
      if (chartObj.options.plugins.datalabels !== undefined) {
        delete chartObj.options.plugins.datalabels;
      }
    }

    // 6) Legend
    if (legend) {
      if (!chartObj.options.plugins.legend) {
        chartObj.options.plugins.legend = {};
      }
      if (typeof legend.display === 'boolean') {
        chartObj.options.plugins.legend.display = legend.display;
      }
      if (legend.position) {
        chartObj.options.plugins.legend.position = legend.position;
      }
      if (legend.align) {
        chartObj.options.plugins.legend.align = legend.align;
      }
    }

    // 7) backgroundImageUrl
    if (backgroundImageUrl) {
      chartObj.options.plugins.backgroundImageUrl = backgroundImageUrl;
    }

    // 8) datasetColors
    if (datasetColors && Array.isArray(datasetColors)) {
      if (
        chartObj.data &&
        Array.isArray(chartObj.data.datasets) &&
        chartObj.data.datasets.length > 0
      ) {
        chartObj.data.datasets.forEach((ds, idx) => {
          if (datasetColors[idx]) {
            const { backgroundColor, borderColor } = datasetColors[idx];
            if (backgroundColor) {
              ds.backgroundColor = backgroundColor;
            }
            if (borderColor) {
              ds.borderColor = borderColor;
            }
          }
        });
      }
    }

    // 9) globalPointStyle (chartObj.options.elements.point)
    if (globalPointStyle) {
      if (!chartObj.options.elements) {
        chartObj.options.elements = {};
      }
      if (!chartObj.options.elements.point) {
        chartObj.options.elements.point = {};
      }
      const gps = globalPointStyle;
      if (typeof gps.backgroundColor !== 'undefined') {
        chartObj.options.elements.point.backgroundColor = gps.backgroundColor;
      }
      if (typeof gps.borderColor !== 'undefined') {
        chartObj.options.elements.point.borderColor = gps.borderColor;
      }
      if (typeof gps.borderWidth !== 'undefined') {
        chartObj.options.elements.point.borderWidth = gps.borderWidth;
      }
      if (typeof gps.radius !== 'undefined') {
        chartObj.options.elements.point.radius = gps.radius;
      }
      if (typeof gps.rotation !== 'undefined') {
        chartObj.options.elements.point.rotation = gps.rotation;
      }
      if (typeof gps.pointStyle !== 'undefined') {
        chartObj.options.elements.point.pointStyle = gps.pointStyle;
      }
    }

    // 10) datasetPointStyle
    if (datasetPointStyle && Array.isArray(datasetPointStyle)) {
      if (
        chartObj.data &&
        Array.isArray(chartObj.data.datasets) &&
        chartObj.data.datasets.length > 0
      ) {
        chartObj.data.datasets.forEach((ds, idx) => {
          const dps = datasetPointStyle[idx];
          if (dps) {
            if (typeof dps.pointStyle !== 'undefined') {
              ds.pointStyle = dps.pointStyle;
            }
            if (typeof dps.pointRadius !== 'undefined') {
              ds.pointRadius = dps.pointRadius;
            }
            if (typeof dps.pointBorderWidth !== 'undefined') {
              ds.pointBorderWidth = dps.pointBorderWidth;
            }
            if (typeof dps.pointRotation !== 'undefined') {
              ds.pointRotation = dps.pointRotation;
            }
            if (typeof dps.pointBackgroundColor !== 'undefined') {
              ds.pointBackgroundColor = dps.pointBackgroundColor;
            }
            if (typeof dps.pointBorderColor !== 'undefined') {
              ds.pointBorderColor = dps.pointBorderColor;
            }
          }
        });
      }
    }

    // 11) datasetLineStyle
    if (datasetLineStyle && Array.isArray(datasetLineStyle)) {
      if (
        chartObj.data &&
        Array.isArray(chartObj.data.datasets) &&
        chartObj.data.datasets.length > 0
      ) {
        chartObj.data.datasets.forEach((ds, idx) => {
          const dls = datasetLineStyle[idx];
          if (dls) {
            if (typeof dls.backgroundColor !== 'undefined') {
              ds.backgroundColor = dls.backgroundColor;
            }
            if (typeof dls.borderCapStyle !== 'undefined') {
              ds.borderCapStyle = dls.borderCapStyle;
            }
            if (typeof dls.borderColor !== 'undefined') {
              ds.borderColor = dls.borderColor;
            }
            if (Array.isArray(dls.borderDash)) {
              ds.borderDash = dls.borderDash;
            }
            if (typeof dls.borderDashOffset !== 'undefined') {
              ds.borderDashOffset = dls.borderDashOffset;
            }
            if (typeof dls.borderJoinStyle !== 'undefined') {
              ds.borderJoinStyle = dls.borderJoinStyle;
            }
            if (typeof dls.borderWidth !== 'undefined') {
              ds.borderWidth = dls.borderWidth;
            }
            if (typeof dls.clip !== 'undefined') {
              ds.clip = dls.clip;
            }
            if (typeof dls.fill !== 'undefined') {
              ds.fill = dls.fill;
            }
            if (typeof dls.lineTension !== 'undefined') {
              ds.lineTension = dls.lineTension;
            }
            if (typeof dls.showLine !== 'undefined') {
              ds.showLine = dls.showLine;
            }
            if (typeof dls.spanGaps !== 'undefined') {
              ds.spanGaps = dls.spanGaps;
            }
            if (typeof dls.steppedLine !== 'undefined') {
              ds.steppedLine = dls.steppedLine;
            }
          }
        });
      }
    }

    // 12) timeAxis (for explicit time-series on the X-axis)
    if (timeAxis && timeAxis.enabled) {
      // Mark x-axis as time
      chartObj.options.scales.x.type = 'time';
      if (!chartObj.options.scales.x.time) {
        chartObj.options.scales.x.time = {};
      }
      if (timeAxis.parser) {
        chartObj.options.scales.x.time.parser = timeAxis.parser;
      }
      if (timeAxis.unit) {
        chartObj.options.scales.x.time.unit = timeAxis.unit;
      }
      if (timeAxis.minUnit) {
        chartObj.options.scales.x.time.minUnit = timeAxis.minUnit;
      }
      if (typeof timeAxis.stepSize !== 'undefined') {
        chartObj.options.scales.x.time.stepSize = timeAxis.stepSize;
      }
      if (typeof timeAxis.isoWeekday !== 'undefined') {
        chartObj.options.scales.x.time.isoWeekday = timeAxis.isoWeekday;
      }
      if (timeAxis.round) {
        chartObj.options.scales.x.time.round = timeAxis.round;
      }
      if (timeAxis.displayFormats) {
        chartObj.options.scales.x.time.displayFormats = timeAxis.displayFormats;
      }
    }

    // 13) globalLineTension (apply to all line datasets if set)
    if (
      typeof globalLineTension === 'number' &&
      chartObj.data &&
      Array.isArray(chartObj.data.datasets)
    ) {
      chartObj.data.datasets.forEach((ds) => {
        // Only apply if it's a line dataset
        // If ds.type is "line" or not specified and chart type is "line"
        const chartType = chartObj.type || ds.type;
        // If there's an overall chartObj.type, we assume all are lines unless overridden
        // but let's do a safe check:
        const dsType = ds.type || chartObj.type;
        if (dsType && dsType.toLowerCase() === 'line') {
          ds.lineTension = globalLineTension;
        }
      });
    }

    // 14) roundedBars (enable plugin for bar rounding)
    if (roundedBars && roundedBars.enabled) {
      // If cornerRadius is set, pass object. Else pass true.
      if (typeof roundedBars.cornerRadius === 'number') {
        chartObj.options.plugins.roundedBars = { cornerRadius: roundedBars.cornerRadius };
      } else {
        chartObj.options.plugins.roundedBars = true;
      }
    }

    // Build final request for QuickChart
    const body = {
      chart: chartObj,
      width: 500,
      height: 300,
      backgroundColor: chartBackgroundColor || 'transparent',
      format: 'png',
      devicePixelRatio: 2,
    };

    if (this.baseUrl !== QUICKCHART_BASE_URL_ORIG && neverExpire) {
      body.neverExpire = neverExpire;
    }

    // Send to QuickChart
    try {
      const quickchartBaseUrl = this.baseUrl;
      const response = await fetch(`${quickchartBaseUrl}/chart/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        return `Error: QuickChart request failed with status ${response.status}. Body: ${errorText}`;
      }

      const data = await response.json();
      if (!data.url) {
        return `Error: No "url" returned from QuickChart. Full response: ${JSON.stringify(data)}`;
      }

      return this.baseUrl === QUICKCHART_BASE_URL_ORIG
        ? `Here is your chart!\n Embed this URL as a markdown image: ${data.url}`
        : `Here is your chart!\n Embed this URL as a markdown image: ${data.url}.\n Don't change url to QuickChart.io URL format (https://quickchart.io/chart/render/sf-[ID]).
Use the same url you get`;
    } catch (err) {
      return `Error: Failed to call QuickChart. ${err.message}`;
    }
  }
}

module.exports = Quickchart;
