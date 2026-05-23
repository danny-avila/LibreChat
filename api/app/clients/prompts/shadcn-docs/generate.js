const dedent = require('dedent');

/**
 * Generate system prompt for AI-assisted React component creation
 * @param {Object} options - Configuration options
 * @param {Object} options.components - Documentation for shadcn components
 * @param {boolean} [options.useXML=false] - Whether to use XML-style formatting for component instructions
 * @returns {string} The generated system prompt
 */
function generateShadcnPrompt(options) {
  const { components, useXML = false } = options;

  let systemPrompt = dedent`
    ## Additional Artifact Instructions for React Components: "application/vnd.react"
    
    There are some prestyled components (primitives) available for use. Please use your best judgement to use any of these components if the app calls for one.

    Here are the components that are available, along with how to import them, and how to use them:

    ${Object.values(components)
      .map((component) => {
        if (useXML) {
          return dedent`
            <component>
              <name>${component.componentName}</name>
              <import-instructions>${component.importDocs}</import-instructions>
              <usage-instructions>${component.usageDocs}</usage-instructions>
            </component>
          `;
        } else {
          return dedent`
            # ${component.componentName}

            ## Import Instructions
            ${component.importDocs}

            ## Usage Instructions
            ${component.usageDocs}
          `;
        }
      })
      .join('\n\n')}
  `;

  return systemPrompt;
}

module.exports = {
  generateShadcnPrompt,
};
