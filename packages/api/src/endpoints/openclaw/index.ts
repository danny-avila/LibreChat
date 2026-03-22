/**
 * OpenClaw Endpoint for LibreChat
 *
 * This module provides deep integration between LibreChat and OpenClaw,
 * exposing OpenClaw's advanced agent capabilities including:
 *
 * - ACP (Agent Client Protocol) for session management
 * - Thinking levels (off, minimal, low, medium, high, xhigh)
 * - Skills system for extensible commands
 * - Model switching during conversation
 * - Streaming support for thinking and tool calls
 *
 * Usage:
 * Configure in librechat.yaml:
 *
 * endpoints:
 *   openclaw:
 *     - name: "OpenClaw"
 *       apiKey: ${OPENCLAW_API_KEY}
 *       baseURL: http://localhost:18789
 *       models:
 *         default: ["agent:main", "agent:fast", "agent:deep"]
 *       customParams:
 *         thinkingLevel: "medium"
 *         enableSkills: true
 */

export * from './config';
export * from './initialize';
export * from './client';
export * from './gateway';
export * from './events';
export * from './controller';
