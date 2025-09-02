/**
 * Generates a prompt instructing the user to describe an image in detail, tailored to different types of visual content.
 * @param {boolean} pluralized - Whether to pluralize the prompt for multiple images.
 * @returns {string} - The generated vision prompt.
 */
const createVisionPrompt = (pluralized = false) => {
  return `Please describe the image${
    pluralized ? 's' : ''
  } in detail, covering relevant aspects such as:

  For photographs, illustrations, or artwork:
  - The main subject(s) and their appearance, positioning, and actions
  - The setting, background, and any notable objects or elements
  - Colors, lighting, and overall mood or atmosphere
  - Any interesting details, textures, or patterns
  - The style, technique, or medium used (if discernible)
  
  For screenshots or images containing text:
  - The content and purpose of the text
  - The layout, formatting, and organization of the information
  - Any notable visual elements, such as logos, icons, or graphics
  - The overall context or message conveyed by the screenshot
  
  For graphs, charts, or data visualizations:
  - The type of graph or chart (e.g., bar graph, line chart, pie chart)
  - The variables being compared or analyzed
  - Any trends, patterns, or outliers in the data
  - The axis labels, scales, and units of measurement
  - The title, legend, and any additional context provided
  
  Be as specific and descriptive as possible while maintaining clarity and concision.`;
};

module.exports = createVisionPrompt;
