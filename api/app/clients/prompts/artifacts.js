const dedent = require('dedent');
const { EModelEndpoint, ArtifactModes } = require('librechat-data-provider');
const { generateShadcnPrompt } = require('~/app/clients/prompts/shadcn-docs/generate');
const { components } = require('~/app/clients/prompts/shadcn-docs/components');

// Common introduction to artifacts
const artifactsPromptIntroduction = dedent`The assistant can create and reference artifacts during conversations.
  
Artifacts are for substantial, self-contained content that users might modify or reuse, displayed in a separate UI window for clarity.

# Good artifacts are...
- Substantial content (>15 lines)
- Content that the user is likely to modify, iterate on, or take ownership of
- Self-contained, complex content that can be understood on its own, without context from the conversation
- Content intended for eventual use outside the conversation (e.g., reports, emails, presentations)
- Content likely to be referenced or reused multiple times

# Don't use artifacts for...
- Simple, informational, or short content, such as brief code snippets, mathematical equations, or small examples
- Primarily explanatory, instructional, or illustrative content, such as examples provided to clarify a concept
- Suggestions, commentary, or feedback on existing artifacts
- Conversational or explanatory content that doesn't represent a standalone piece of work
- Content that is dependent on the current conversational context to be useful
- Content that is unlikely to be modified or iterated upon by the user
- Request from users that appears to be a one-off question

# Usage notes
- One artifact per message unless specifically requested
- Prefer in-line content (don't use artifacts) when possible. Unnecessary use of artifacts can be jarring for users.
- If a user asks the assistant to "draw an SVG" or "make a website," the assistant does not need to explain that it doesn't have these capabilities. Creating the code and placing it within the appropriate artifact will fulfill the user's intentions.
- If asked to generate an image, the assistant can offer an SVG instead. The assistant isn't very proficient at making SVG images but should engage with the task positively. Self-deprecating humor about its abilities can make it an entertaining experience for users.
- The assistant errs on the side of simplicity and avoids overusing artifacts for content that can be effectively presented within the conversation.
- Always provide complete, specific, and fully functional content for artifacts without any snippets, placeholders, ellipses, or 'remains the same' comments.
- If an artifact is not necessary or requested, the assistant should not mention artifacts at all, and respond to the user accordingly.`;

// Formatting instructions. Non-antrophic models need more complex instructions.
const formatInstructionsAntrophic = dedent`
  When collaborating with the user on creating content that falls into compatible categories, the assistant should follow these steps:
  1. Create the artifact using the following format:

     :::artifact{identifier="unique-identifier" type="mime-type" title="Artifact Title"}
     \`\`\`
     Your artifact content here
     \`\`\`
     :::`;

const formatInstructions = dedent`
  When collaborating with the user on creating content that falls into compatible categories, the assistant should follow these steps:
  1. Create the artifact using the following remark-directive markdown format:

      :::artifact{identifier="unique-identifier" type="mime-type" title="Artifact Title"}
      \`\`\`
      Your artifact content here
      \`\`\`
      :::

  a. Example of correct format:

      :::artifact{identifier="example-artifact" type="text/plain" title="Example Artifact"}
      \`\`\`
      This is the content of the artifact.
      It can span multiple lines.
      \`\`\`
      :::

  b. Common mistakes to avoid:
   - Don't split the opening ::: line
   - Don't add extra backticks outside the artifact structure
   - Don't omit the closing :::`;

const formatInstructionsOutro = dedent`2. Assign an identifier to the \`identifier\` attribute. For updates, reuse the prior identifier. For new artifacts, the identifier should be descriptive and relevant to the content, using kebab-case (e.g., "example-code-snippet"). This identifier will be used consistently throughout the artifact's lifecycle, even when updating or iterating on the artifact.
  3. Include a \`title\` attribute to provide a brief title or description of the content.
  4. Add a \`type\` attribute to specify the type of content the artifact represents. Assign one of the following values to the \`type\` attribute:`;

// Dictionary of all available artifact types. Includes a description and usage examples
const artifactTypes = {
  'text/markdown': {
    name: 'Documents',
    instructions: ['Plain text, Markdown, or other formatted text documents'],
    example: {
      user: 'Can you create a document that contains a list of my favorite fruits?',
      assistant: dedent`
      
      :::artifact{identifier="favorite-fruits" type="text/markdown" title="My Favorite Fruits"}
      \`\`\`
      # My Favorite Fruits

      Here's a list of my favorite fruits:

      * Apples
      * Bananas
      * Strawberries
      \`\`\`
      :::
      `,
    },
  },
  'text/html': {
    name: 'HTML',
    instructions: [
      'The user interface can render single file HTML pages placed within the artifact tags. HTML, JS, and CSS should be in a single file when using the `text/html` type',
      'Images from the web are not allowed, but you can use placeholder images by specifying the width and height like so `<img src="/api/placeholder/400/320" alt="placeholder" />`',
      'The only place external scripts can be imported from is https://cdnjs.cloudflare.com',
    ],
    example: {
      user: 'Create a basic HTML structure for a blog post',
      assistant: dedent`Here's a basic HTML structure for a blog post:

      :::artifact{identifier="blog-post-html" type="text/html" title="Blog Post HTML"}
      \`\`\`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>My Blog Post</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; }
          h1 { color: #333; }
          p { margin-bottom: 15px; }
        </style>
      </head>
      <body>
        <header>
          <h1>My First Blog Post</h1>
        </header>
        <main>
          <article>
            <p>This is the content of my blog post. It's short and sweet!</p>
          </article>
        </main>
        <footer>
          <p>&copy; 2023 My Blog</p>
        </footer>
      </body>
      </html>
      \`\`\`
      :::

      This HTML structure provides a simple layout for a blog post.`,
    },
  },
  'image/svg': {
    name: 'SVG',
    instructions: [
      'The user interface will render the Scalable Vector Graphics (SVG) image within the artifact tags.',
      'The assistant should specify the viewbox of the SVG rather than defining a width/height',
    ],
  },
  'application/vnd.mermaid': {
    name: 'Mermaid diagrams',
    instructions: [
      'The user interface will render Mermaid diagrams placed within the artifact tags.',
    ],
  },
  'application/vnd.react': {
    name: 'React Components',
    instructions: [
      'Use this for displaying either: React elements, e.g. `<strong>Hello World!</strong>`, React pure functional components, e.g. `() => <strong>Hello World!</strong>`, React functional components with Hooks, or React component classes',
      'When creating a React component, ensure it has no required props (or provide default values for all props) and use a default export.',
      'Use Tailwind classes for styling. DO NOT USE ARBITRARY VALUES (e.g. `h-[600px]`).',
      'Base React is available to be imported. To use hooks, first import it at the top of the artifact, e.g. `import { useState } from "react"`',
      'The lucide-react@0.394.0 library is available to be imported. e.g. `import { Camera } from "lucide-react"` & `<Camera color="red" size={48} />`',
      'The recharts charting library is available to be imported, e.g. `import { LineChart, XAxis, ... } from "recharts"` & `<LineChart ...><XAxis dataKey="name"> ...`',
      'The three.js library is available to be imported, e.g. `import * as THREE from "three";`',
      'The date-fns library is available to be imported, e.g. `import { compareAsc, format } from "date-fns";`',
      'The react-day-picker library is available to be imported, e.g. `import { DayPicker } from "react-day-picker";`',
      "The assistant can use prebuilt components from the `shadcn/ui` library after it is imported: `import { Alert, AlertDescription, AlertTitle, AlertDialog, AlertDialogAction } from '/components/ui/alert';`. If using components from the shadcn/ui library, the assistant mentions this to the user and offers to help them install the components if necessary.",
      'Components MUST be imported from `/components/ui/name` and NOT from `/components/name` or `@/components/ui/name`.',
      'NO OTHER LIBRARIES (e.g. zod, hookform) ARE INSTALLED OR ABLE TO BE IMPORTED.',
      'Images from the web are not allowed, but you can use placeholder images by specifying the width and height like so `<img src="/api/placeholder/400/320" alt="placeholder" />`',
      'When iterating on code, ensure that the code is complete and functional without any snippets, placeholders, or ellipses.',
      "If you are unable to follow the above requirements for any reason, don't use artifacts and use regular code blocks instead, which will not attempt to render the component.",
    ],
    example: {
      user: 'Create a simple React counter component',
      assistant: dedent`Here's a simple React counter component:

      :::artifact{identifier="react-counter" type="application/vnd.react" title="React Counter"}
      \`\`\`
      import { useState } from 'react';

      export default function Counter() {
        const [count, setCount] = useState(0);
        return (
          <div className="p-4">
            <p className="mb-2">Count: {count}</p>
            <button className="bg-blue-500 text-white px-4 py-2 rounded" onClick={() => setCount(count + 1)}>
              Increment
            </button>
          </div>
        );
      }
      \`\`\`
      :::

      This component creates a simple counter with an increment button.`,
    },
  },
};

/**
 *
 * @param {Object} params
 * @param {EModelEndpoint | string} params.endpoint - The current endpoint
 * @param {ArtifactModes} params.artifacts - The current artifact mode
 * @returns
 */
const generateArtifactsPrompt = ({ endpoint, artifacts }) => {
  if (artifacts === ArtifactModes.CUSTOM) {
    // Custom prompt mode, let the user choose it
    return null;
  }

  const enabledTypes = Object.keys(artifactTypes);

  // Build prompt
  let prompt = artifactsPromptIntroduction;

  if (endpoint === EModelEndpoint.anthropic) {
    prompt += `<artifact_instructions>\n\n${formatInstructionsAntrophic}\n\n`;
  } else {
    prompt += `## Artifact Instructions\n${formatInstructions}\n\n`;
  }

  prompt += formatInstructionsOutro;

  // List instructions for all enabled artifact types
  for (const key of enabledTypes) {
    prompt += `    - ${artifactTypes[key].name}: "${key}"\n`;
    for (const inst of artifactTypes[key].instructions) {
      prompt += `      - ${inst}\n`;
    }
  }

  prompt += dedent`5. Include the complete and updated content of the artifact, without any truncation or minimization. Don't use "// rest of the code remains the same...".
  6. If unsure whether the content qualifies as an artifact, if an artifact should be updated, or which type to assign to an artifact, err on the side of not creating an artifact.\n`;

  // Final examples and formatting instructions
  // Anthrophic uses XML, others regular markdown
  if (endpoint === EModelEndpoint.anthropic) {
    prompt += dedent`  7. Always use triple backticks (\`\`\`) to enclose the content within the artifact, regardless of the content type.
                    </artifact_instructions>

                    Here are some examples of correct usage of artifacts:

                    <examples>\n`;

    // Iterate examples
    for (const key of enabledTypes) {
      const example = artifactTypes[key].example;
      if (example) {
        prompt += '  <example>\n';
        prompt += `    <user_query>${example.user}</user_query>\n`;
        prompt += `    <assistant_response>\n${example.assistant}\n    </assistant_response>\n`;
        prompt += '  </example>\n';
      }
    }
    prompt += '</examples>\n';
  } else {
    prompt += dedent`7. NEVER use triple backticks to enclose the artifact, ONLY the content within the artifact.

      Here are some examples of correct usage of artifacts:
      
      ## Examples\n`;

    // Iterate examples
    let i = 1;
    for (const key of enabledTypes) {
      const example = artifactTypes[key].example;
      if (example) {
        prompt += `### Example ${i++}\n\n`;
        prompt += `  User: ${example.user}\n\n`;
        prompt += `  Assistant: ${example.assistant}\n\n---\n\n`;
      }
    }
  }

  // Add extra information if SHADCNUI is selected
  if (artifacts === ArtifactModes.SHADCNUI) {
    prompt += generateShadcnPrompt({ components, useXML: endpoint === EModelEndpoint.anthropic });
  }

  return prompt;
};

module.exports = generateArtifactsPrompt;
