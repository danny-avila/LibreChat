// client/src/utils/artifacts/core.ts
export const DEPENDENCY_VERSIONS: Record<string, string> = {
  react: "19.2.4",
  "react-dom": "19.2.4",

  // Rendering
  "react-markdown": "10.1.0",
  mermaid: "11.12.2",

  // App/UI ecosystem
  three: "0.167.1",
  "lucide-react": "0.394.0",
  "react-router-dom": "6.11.2",
  "class-variance-authority": "0.6.0",
  clsx: "1.2.1",
  "date-fns": "3.3.1",
  "tailwind-merge": "1.9.1",
  "tailwindcss-animate": "1.0.5",
  recharts: "2.12.7",
  lodash: "4.17.21",
  "framer-motion": "11.0.8",
  "embla-carousel-react": "8.2.0",
  "react-day-picker": "9.0.8",
  "dat.gui": "0.7.9",
  cmdk: "1.0.0",
  vaul: "0.9.1",
  sonner: "1.4.0",

  // Radix
  "@radix-ui/react-accordion": "1.1.2",
  "@radix-ui/react-alert-dialog": "1.0.2",
  "@radix-ui/react-aspect-ratio": "1.1.0",
  "@radix-ui/react-avatar": "1.1.0",
  "@radix-ui/react-checkbox": "1.0.3",
  "@radix-ui/react-collapsible": "1.0.3",
  "@radix-ui/react-dialog": "1.0.2",
  "@radix-ui/react-dropdown-menu": "2.1.1",
  "@radix-ui/react-hover-card": "1.0.5",
  "@radix-ui/react-label": "2.0.0",
  "@radix-ui/react-menubar": "1.1.1",
  "@radix-ui/react-navigation-menu": "1.2.0",
  "@radix-ui/react-popover": "1.0.7",
  "@radix-ui/react-progress": "1.1.0",
  "@radix-ui/react-radio-group": "1.1.3",
  "@radix-ui/react-select": "2.0.0",
  "@radix-ui/react-separator": "1.0.3",
  "@radix-ui/react-slider": "1.1.1",
  "@radix-ui/react-slot": "1.1.0",
  "@radix-ui/react-switch": "1.0.3",
  "@radix-ui/react-tabs": "1.0.3",
  "@radix-ui/react-toast": "1.1.5",
  "@radix-ui/react-toggle": "1.1.0",
  "@radix-ui/react-toggle-group": "1.1.0",
  "@radix-ui/react-tooltip": "1.2.8",
};

const NEEDS_REACT_PEER_PREFIXES = ["recharts", "framer-motion", "react-router", "react-router-dom", "lucide-react",
  "@radix-ui/", "cmdk", "embla-carousel-react", "vaul", "sonner", "react-day-picker",];

function withVersion(pkg: string) {
  return DEPENDENCY_VERSIONS[pkg] ?? "latest";
}

export function resolveNpmUrl(pkg: string): string {
  const version = withVersion(pkg);
  let url = `https://esm.sh/${pkg}@${version}?dev`;

  if (NEEDS_REACT_PEER_PREFIXES.some((p) => pkg.startsWith(p))) {
    url += `&external=react,react-dom`;
  }

  // helps avoid export edge cases
  if (pkg === "lucide-react") {
    url += "&bundle";
  }

  return url;
}

export function buildImportMap(npmImports: Set<string>) {
  const react = DEPENDENCY_VERSIONS.react;
  const reactDom = DEPENDENCY_VERSIONS["react-dom"];

  const imports: Record<string, string> = {
    react: `https://esm.sh/react@${react}?dev`,
    "react/": `https://esm.sh/react@${react}/`,
    "react-dom": `https://esm.sh/react-dom@${reactDom}?dev`,
    "react-dom/": `https://esm.sh/react-dom@${reactDom}/`,
    "react-dom/client": `https://esm.sh/react-dom@${reactDom}/client?dev`,
    "react/jsx-runtime": `https://esm.sh/react@${react}/jsx-runtime`,
    "react/jsx-dev-runtime": `https://esm.sh/react@${react}/jsx-dev-runtime`,
  };

  for (const pkg of npmImports) {
    if (!imports[pkg]) imports[pkg] = resolveNpmUrl(pkg);
  }

  return imports;
}
