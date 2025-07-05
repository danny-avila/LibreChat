// ESM bundler config for React components
import resolve from '@rollup/plugin-node-resolve';
import typescript from '@rollup/plugin-typescript';
import alias from '@rollup/plugin-alias';
import { fileURLToPath } from 'url';
import { dirname, resolve as pathResolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  input: 'src/index.ts',
  output: {
    dir: 'dist',
    format: 'es',
    preserveModules: true,
  },
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@radix-ui/react-separator',
    '@radix-ui/react-slot',
    'class-variance-authority',
    'clsx',
    'framer-motion',
    'lucide-react',
    'tailwind-merge',
  ],
  plugins: [
    alias({
      entries: [{ find: '~', replacement: pathResolve(__dirname, 'src') }],
    }),
    resolve(),
    typescript({
      tsconfig: './tsconfig.json',
      jsx: 'react-jsx',
    }),
  ],
};
