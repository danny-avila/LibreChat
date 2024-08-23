import dedent from 'dedent';
import type { CodeBlock } from '~/common';

const artifactFilename = {
  'application/vnd.react': 'App.tsx',
  'text/html': 'index.html',
  // 'css': 'css',
  // 'javascript': 'js',
  // 'typescript': 'ts',
  // 'jsx': 'jsx',
  // 'tsx': 'tsx',
};

export function getArtifactFilename(type: string): string {
  return artifactFilename[type] ?? 'App.tsx';
}

export function getFileExtension(language?: string): string {
  switch (language) {
    case 'application/vnd.react':
      return 'tsx';
    case 'text/html':
      return 'html';
    // case 'jsx':
    //   return 'jsx';
    // case 'tsx':
    //   return 'tsx';
    // case 'html':
    //   return 'html';
    // case 'css':
    //   return 'css';
    default:
      return 'txt';
  }
}

export const sharedProps = {
  template: 'react-ts',
  customSetup: {
    dependencies: {
      'lucide-react': '^0.394.0',
      'react-router-dom': '^6.11.2',
      'class-variance-authority': '^0.6.0',
      clsx: '^1.2.1',
      'date-fns': '^3.3.1',
      'tailwind-merge': '^1.9.1',
      'tailwindcss-animate': '^1.0.5',
      // recharts: '2.9.0',
      // '@radix-ui/react-accordion': '^1.2.0',
      // '@radix-ui/react-alert-dialog': '^1.1.1',
      // '@radix-ui/react-aspect-ratio': '^1.1.0',
      // '@radix-ui/react-avatar': '^1.1.0',
      // '@radix-ui/react-checkbox': '^1.1.1',
      // '@radix-ui/react-collapsible': '^1.1.0',
      // '@radix-ui/react-dialog': '^1.1.1',
      // '@radix-ui/react-dropdown-menu': '^2.1.1',
      // '@radix-ui/react-hover-card': '^1.1.1',
      // '@radix-ui/react-label': '^2.1.0',
      // '@radix-ui/react-menubar': '^1.1.1',
      // '@radix-ui/react-navigation-menu': '^1.2.0',
      // '@radix-ui/react-popover': '^1.1.1',
      // '@radix-ui/react-progress': '^1.1.0',
      // '@radix-ui/react-radio-group': '^1.2.0',
      // '@radix-ui/react-select': '^2.1.1',
      // '@radix-ui/react-separator': '^1.1.0',
      // '@radix-ui/react-slider': '^1.2.0',
      // '@radix-ui/react-slot': '^1.1.0',
      // '@radix-ui/react-switch': '^1.1.0',
      // '@radix-ui/react-tabs': '^1.1.0',
      // '@radix-ui/react-toast': '^1.2.1',
      // '@radix-ui/react-toggle': '^1.1.0',
      // '@radix-ui/react-toggle-group': '^1.1.0',
      // '@radix-ui/react-tooltip': '^1.1.2',

      // 'embla-carousel-react': '^8.1.8',
      // 'react-day-picker': '^8.10.1',
      // vaul: '^0.9.1',
    },
  },
} as const;

export const sharedOptions = {
  externalResources: ['https://unpkg.com/@tailwindcss/ui/dist/tailwind-ui.min.css'],
};

export const sharedFiles = {
  '/public/index.html': dedent`
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Document</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
  `,
};
