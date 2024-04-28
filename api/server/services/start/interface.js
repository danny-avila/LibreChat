/**
 * Loads the default interface object.
 * @param {TCustomConfig | undefined} config - The loaded custom configuration.
 * @param {TConfigDefaults} configDefaults - The custom configuration default values.
 * @returns {TCustomConfig['interface']} The default interface object.
 */
function loadDefaultInterface(config, configDefaults) {
  const { interface } = config ?? {};
  const { interface: defaults } = configDefaults;
  const hasModelSpecs = config?.modelSpecs?.list?.length > 0;

  return {
    endpointsMenu: interface?.endpointsMenu ?? (hasModelSpecs ? false : defaults.endpointsMenu),
    modelSelect: interface?.modelSelect ?? (hasModelSpecs ? false : defaults.modelSelect),
    parameters: interface?.parameters ?? (hasModelSpecs ? false : defaults.parameters),
    presets: interface?.presets ?? (hasModelSpecs ? false : defaults.presets),
    sidePanel: interface?.sidePanel ?? defaults.sidePanel,
    privacyPolicy: interface?.privacyPolicy ?? defaults.privacyPolicy,
    termsOfService: interface?.termsOfService ?? defaults.termsOfService,
  };
}

module.exports = { loadDefaultInterface };
