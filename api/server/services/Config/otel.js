/** @returns {TStartupConfig['otel'] | undefined} */
const getOtelConfig = () => {
  const otelEnabled = !!process.env.OTEL_ENDPOINT && !!process.env.OTEL_API_KEY;

  const otel = {
    enabled: otelEnabled,
  };

  if (!otelEnabled) {
    return otel;
  }

  otel.otelEndpoint = process.env.OTEL_ENDPOINT;
  otel.otelApiKey = process.env.OTEL_API_KEY;

  return otel;
};

module.exports = {
  getOtelConfig,
};
