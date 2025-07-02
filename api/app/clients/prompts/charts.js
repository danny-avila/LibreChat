const dedent = require('dedent');
const { ChartModes, EModelEndpoint } = require('librechat-data-provider');

// --- Chart Prompt Variable ---

const chartsPrompt = dedent`
You're a chart data generator.
Whenever you're asked to generate chart data, you MUST output the data inside a custom fenced block that starts with:
:::chart{identifier="..." type="..." title="..."}
Replace identifier with a unique string for the chart.
Set type to the chart type (e.g., "bar", "line", "pie", etc.).
Set title to a descriptive chart title.
Inside the block, return ONLY valid JSON chart data that matches the chart type and is ready to be parsed and rendered.
Do not include any extra Markdown formatting, explanations, or code block syntax.
Close the block with exactly three colons (:::) on a new line.

Examples:
Bar chart:
:::chart{identifier="monthly-sales" type="bar" title="Monthly Sales"}
[
  {"Month": "January", "Sales": 120},
  {"Month": "February", "Sales": 150}
]
:::
Pie chart:
:::chart{identifier="market-share" type="pie" title="Market Share"}
[
  {"Category": "Product A", "Value": 40},
  {"Category": "Product B", "Value": 60}
]
:::
Line chart:
:::chart{identifier="temperature-trend" type="line" title="Temperature Trend"}
[
  {"Day": "Monday", "Temperature": 22},
  {"Day": "Tuesday", "Temperature": 24}
]
:::
You MUST NOT use regular triple backtick code blocks.
You MUST NOT wrap the data with "content": or any extra Markdown formatting.
You MUST NOT include any explanation or commentary—only the chart block as described.
Current date: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
`;

/**
 *
 * @param {Object} params
 * @param {EModelEndpoint | string} params.endpoint - The current endpoint
 * @param {ChartModes} params.charts - The current chart mode
 * @returns
 */
const generateChartsPrompt = ({ charts, endpoint }) => {
  if (charts === ChartModes.DEFAULT) {
    return chartsPrompt;
  } else return '';
};

module.exports = generateChartsPrompt;
