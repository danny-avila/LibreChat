/**
 * `@librechat/agents` publishes its declaration files with its internal `@/*` path aliases
 * unrewritten, so a consumer cannot resolve them. `types/llm.d.ts` imports `Providers` that
 * way, which leaves `ProviderOptionsMap`'s computed keys unresolved and collapses
 * `keyof ProviderOptionsMap` to `number`. Until v3.6.16 that only degraded `LLMConfig`
 * silently; v3.6.16 made `SharedLLMConfig` generic over that key union, so `provider` became
 * `number | RuntimeProviderName` and no real provider was assignable to it.
 *
 * Declaring the one alias `llm.d.ts` needs restores the enum, and with it the provider key
 * union. Remove this once the SDK ships declarations with its aliases resolved — note that
 * mapping every `@/*` alias instead unmasks a large backlog of latent errors elsewhere in
 * this package, so widening it is a separate cleanup rather than a drop-in improvement.
 */
declare module '@/common' {
  export { Providers } from '@librechat/agents';
}
