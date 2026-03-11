import { math, isEnabled } from '~/utils';

/**
 * Centralized configuration for MCP-related environment variables.
 * Provides typed access to MCP settings with default values.
 */
export const mcpConfig = {
  OAUTH_ON_AUTH_ERROR: isEnabled(process.env.MCP_OAUTH_ON_AUTH_ERROR ?? true),
  OAUTH_DETECTION_TIMEOUT: math(process.env.MCP_OAUTH_DETECTION_TIMEOUT ?? 5000),
  CONNECTION_CHECK_TTL: math(process.env.MCP_CONNECTION_CHECK_TTL ?? 60000),
  /** Idle timeout (ms) after which user connections are disconnected. Default: 15 minutes */
  USER_CONNECTION_IDLE_TIMEOUT: math(
    process.env.MCP_USER_CONNECTION_IDLE_TIMEOUT ?? 15 * 60 * 1000,
  ),
  /** Max connect/disconnect cycles before the circuit breaker trips. Default: 5 */
  CB_MAX_CYCLES: math(process.env.MCP_CB_MAX_CYCLES ?? 5),
  /** Sliding window (ms) for counting cycles. Default: 60s */
  CB_CYCLE_WINDOW_MS: math(process.env.MCP_CB_CYCLE_WINDOW_MS ?? 60_000),
  /** Cooldown (ms) after the cycle breaker trips. Default: 30s */
  CB_CYCLE_COOLDOWN_MS: math(process.env.MCP_CB_CYCLE_COOLDOWN_MS ?? 30_000),
};
