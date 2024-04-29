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

  // warn about config.modelSpecs.prioritize if true and presets are enabled, that default presets will conflict with prioritizing model specs.
  // warn about config.modelSpecs.enforce if true and if any of these, endpointsMenu, modelSelect, presets, or parameters are enabled, that enforcing model specs can conflict with these options.
  // warn if enforce is true and prioritize is not, that enforcing model specs without prioritizing them can lead to unexpected behavior.

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
