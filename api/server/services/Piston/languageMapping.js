/**
 * Maps LibreChat language codes to Piston language names
 */

const LANGUAGE_MAP = {
  python: {
    pistonName: 'python',
    extension: 'py',
    defaultVersion: '*',
  },
  py: {
    pistonName: 'python',
    extension: 'py',
    defaultVersion: '*',
  },
  javascript: {
    pistonName: 'javascript',
    extension: 'js',
    defaultVersion: '*',
  },
  js: {
    pistonName: 'javascript',
    extension: 'js',
    defaultVersion: '*',
  },
  typescript: {
    pistonName: 'typescript',
    extension: 'ts',
    defaultVersion: '*',
  },
  ts: {
    pistonName: 'typescript',
    extension: 'ts',
    defaultVersion: '*',
  },
  java: {
    pistonName: 'java',
    extension: 'java',
    defaultVersion: '*',
  },
  cpp: {
    pistonName: 'cpp',
    extension: 'cpp',
    defaultVersion: '*',
  },
  'c++': {
    pistonName: 'cpp',
    extension: 'cpp',
    defaultVersion: '*',
  },
  c: {
    pistonName: 'c',
    extension: 'c',
    defaultVersion: '*',
  },
  bash: {
    pistonName: 'bash',
    extension: 'sh',
    defaultVersion: '*',
  },
  sh: {
    pistonName: 'bash',
    extension: 'sh',
    defaultVersion: '*',
  },
  shell: {
    pistonName: 'bash',
    extension: 'sh',
    defaultVersion: '*',
  },
  r: {
    pistonName: 'r',
    extension: 'r',
    defaultVersion: '*',
  },
  go: {
    pistonName: 'go',
    extension: 'go',
    defaultVersion: '*',
  },
  rust: {
    pistonName: 'rust',
    extension: 'rs',
    defaultVersion: '*',
  },
  rs: {
    pistonName: 'rust',
    extension: 'rs',
    defaultVersion: '*',
  },
  php: {
    pistonName: 'php',
    extension: 'php',
    defaultVersion: '*',
  },
  ruby: {
    pistonName: 'ruby',
    extension: 'rb',
    defaultVersion: '*',
  },
  rb: {
    pistonName: 'ruby',
    extension: 'rb',
    defaultVersion: '*',
  },
};

/**
 * Gets Piston configuration for a given language code
 * @param {string} lang - Language code
 * @returns {Object} Language configuration with pistonName, extension, and defaultVersion
 * @throws {Error} If language is not supported
 */
function getLanguageConfig(lang) {
  const normalized = lang.toLowerCase();
  const config = LANGUAGE_MAP[normalized];

  if (!config) {
    // Generate a helpful error message with supported languages
    // Filter out aliases (keep only primary language names) for cleaner error message
    const primaryLanguages = Object.keys(LANGUAGE_MAP)
      .filter((key) => !key.includes('-') && key === LANGUAGE_MAP[key].pistonName)
      .slice(0, 10);

    const supported = primaryLanguages.join(', ');
    throw new Error(
      `Unsupported language: "${lang}". Supported languages include: ${supported}, and more. Check the tool description for the full list.`,
    );
  }

  return config;
}

module.exports = {
  LANGUAGE_MAP,
  getLanguageConfig,
};
