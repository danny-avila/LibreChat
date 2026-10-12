import { Providers } from '@librechat/agents';
import type { AppConfig } from '@librechat/data-schemas';
import { getProviderConfig } from '~/endpoints/config/providers';

const providers = new Set<string>([
  ...Object.values(Providers).map((provider) => provider.toLowerCase()),
  'ollama',
]);

/** Endpoint labels in run metadata do not replace the tool's resolved SDK provider. */
export function resolveMCPToolProvider(
  runtimeProvider?: string,
  capturedProvider?: string,
  appConfig?: AppConfig,
): string | undefined {
  const runtime = runtimeProvider?.toLowerCase();
  if (runtime && providers.has(runtime)) {
    return runtime;
  }
  if (capturedProvider && appConfig) {
    return getProviderConfig({
      provider: capturedProvider,
      appConfig,
    }).overrideProvider.toLowerCase();
  }
  const captured = capturedProvider?.toLowerCase();
  if (captured && providers.has(captured)) {
    return captured;
  }
  return runtime || captured;
}
