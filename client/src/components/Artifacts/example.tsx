import dedent from 'dedent';
import { Sandpack } from '@codesandbox/sandpack-react';
import {
  SandpackPreview,
  SandpackProvider,
} from '@codesandbox/sandpack-react/unstyled';
// import './code-viewer.css';

const App = `import React, { useState } from 'react';
import './styles.css';

function App() {
  const [result, setResult] = useState('');

  const handleClick = (e) => {
    setResult(result.concat(e.target.name));
  }

  const clear = () => {
    setResult('');
  }

  const backspace = () => {
    setResult(result.slice(0, -1));
  }

  const calculate = () => {
    try {
      setResult(eval(result).toString());
    } catch(err) {
      setResult('Error');
    }
  }

  return (
    <div className="calculator">
      <input type="text" value={result} />
      <div className="keypad">
        <button className="highlight" onClick={clear} id="clear">Clear</button>
        <button className="highlight" onClick={backspace} id="backspace">C</button>
        <button className="highlight" name="/" onClick={handleClick}>&divide;</button>
        <button name="7" onClick={handleClick}>7</button>
        <button name="8" onClick={handleClick}>8</button>
        <button name="9" onClick={handleClick}>9</button>
        <button className="highlight" name="*" onClick={handleClick}>&times;</button>
        <button name="4" onClick={handleClick}>4</button>
        <button name="5" onClick={handleClick}>5</button>
        <button name="6" onClick={handleClick}>6</button>
        <button className="highlight" name="-" onClick={handleClick}>&ndash;</button>
        <button name="1" onClick={handleClick}>1</button>
        <button name="2" onClick={handleClick}>2</button>
        <button name="3" onClick={handleClick}>3</button>
        <button className="highlight" name="+" onClick={handleClick}>+</button>
        <button name="0" onClick={handleClick}>0</button>
        <button name="." onClick={handleClick}>.</button>
        <button className="highlight" onClick={calculate} id="result">=</button>
      </div>
    </div>
  );
}

export default App;`;

const styles = `
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.calculator {
  width: 320px;
  margin: 100px auto;
}

input[type="text"] {
  width: 100%;
  height: 60px;
  font-size: 20px;
  text-align: right;
  padding: 0 10px;
  pointer-events: none;
}

.keypad {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-gap: 10px;
  padding: 10px;
}

button {
  width: 100%;
  height: 60px;
  font-size: 18px;
  border: none;
  border-radius: 5px;
  cursor: pointer;
  background-color: #f0f0f0;
}

button:hover {
  background-color: #ddd;
}

.highlight {
  background-color: #ff8c00;
  color: white;
}

.highlight:hover {
  background-color: #e67e00;
}
`;

export function DevCodeViewer({
  code,
  showEditor = false,
}: {
  code?: string;
  showEditor?: boolean;
}) {
  return showEditor ? (
    <Sandpack
      options={{
        showNavigator: true,
        editorHeight: '80vh',
        showTabs: true,
        ...sharedOptions,
      }}
      files={{
        // 'App.tsx': code,
        'App.tsx': App,
        ...sharedFiles,
        'styles.css': styles,
      }}
      {...sharedProps}
    />
  ) : (
    <SandpackProvider
      files={{
        // 'App.tsx': code,
        'App.tsx': App,
        ...sharedFiles,
        'styles.css': styles,
      }}
      className="flex h-full w-full grow flex-col justify-center"
      options={{ ...sharedOptions }}
      {...sharedProps}
    >
      <SandpackPreview
        className="flex h-full w-full grow flex-col justify-center p-4 md:pt-16"
        showOpenInCodeSandbox={false}
        showRefreshButton={false}
      />
    </SandpackProvider>
  );
}

const sharedProps = {
  template: 'react-ts',
  // theme: draculaTheme,
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

const sharedOptions = {
  externalResources: [
    'https://unpkg.com/@tailwindcss/ui/dist/tailwind-ui.min.css',
  ],
};

const sharedFiles = {
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