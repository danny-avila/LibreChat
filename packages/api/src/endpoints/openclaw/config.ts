/**
 * OpenClaw Endpoint Configuration Types
 *
 * This module defines the configuration types for the OpenClaw endpoint,
 * including thinking levels, session modes, and skill configurations.
 */

import type { SettingDefinition } from 'librechat-data-provider';

/**
 * Thinking levels supported by OpenClaw
 * - off: No thinking/thinking process shown
 * - minimal: Brief thinking summary
 * - low: Light thinking effort
 * - medium: Standard thinking (default)
 * - high: Deep thinking
 * - xhigh: Maximum thinking (only for capable models)
 */
export type OpenClawThinkLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';

/**
 * Session mode for OpenClaw
 * - auto: Automatic session management
 * - manual: Manual session control
 * - persistent: Persistent sessions
 */
export type OpenClawSessionMode = 'auto' | 'manual' | 'persistent';

/**
 * OpenClaw-specific parameter definitions
 */
export const openClawParamDefinitions: Partial<SettingDefinition>[] = [
  {
    key: 'thinkingLevel',
    type: 'string',
    default: 'medium',
    description: 'Thinking level for the OpenClaw agent',
    options: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'],
  },
  {
    key: 'sessionMode',
    type: 'string',
    default: 'auto',
    description: 'Session management mode',
    options: ['auto', 'manual', 'persistent'],
  },
  {
    key: 'enableSkills',
    type: 'boolean',
    default: true,
    description: 'Enable OpenClaw skills system',
  },
  {
    key: 'model',
    type: 'string',
    default: 'agent:main',
    description: 'OpenClaw model/agent to use',
  },
];

/**
 * OpenClaw endpoint configuration defaults
 */
export const openClawDefaults = {
  thinkingLevel: 'medium' as OpenClawThinkLevel,
  sessionMode: 'auto' as OpenClawSessionMode,
  enableSkills: true,
  model: 'agent:main',
};
