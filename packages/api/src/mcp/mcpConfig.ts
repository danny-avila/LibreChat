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
  /** Max connect/disconnect cycles before the circuit breaker trips. Default: 7 */
  CB_MAX_CYCLES: math(process.env.MCP_CB_MAX_CYCLES ?? 7),
  /** Sliding window (ms) for counting cycles. Default: 45s */
  CB_CYCLE_WINDOW_MS: math(process.env.MCP_CB_CYCLE_WINDOW_MS ?? 45_000),
  /** Cooldown (ms) after the cycle breaker trips. Default: 15s */
  CB_CYCLE_COOLDOWN_MS: math(process.env.MCP_CB_CYCLE_COOLDOWN_MS ?? 15_000),
  /** Max consecutive failed connection rounds before backoff. Default: 3 */
  CB_MAX_FAILED_ROUNDS: math(process.env.MCP_CB_MAX_FAILED_ROUNDS ?? 3),
  /** Sliding window (ms) for counting failed rounds. Default: 120s */
  CB_FAILED_WINDOW_MS: math(process.env.MCP_CB_FAILED_WINDOW_MS ?? 120_000),
  /** Base backoff (ms) after failed round threshold is reached. Default: 30s */
  CB_BASE_BACKOFF_MS: math(process.env.MCP_CB_BASE_BACKOFF_MS ?? 30_000),
  /** Max backoff cap (ms) for exponential backoff. Default: 300s */
  CB_MAX_BACKOFF_MS: math(process.env.MCP_CB_MAX_BACKOFF_MS ?? 300_000),
};
