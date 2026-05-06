const fs = require('fs');
const path = require('path');
const { logger } = require('~/config');

/* The custom-skills registry produced by
 * `api/app/clients/skills/upload-skills.js`. Keyed by local skill slug. */
const REGISTRY_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'app',
  'clients',
  'skills',
  'registry.json',
);

/* The slim system prompt: the role/identity/conversation-flow content the
 * assistants need on every turn, without the bulky reference content (02
 * and 03) that's better off loaded on-demand or via Skills. Today this is
 * just `01-general-instructions.txt`. */
const SLIM_PROMPT_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'app',
  'clients',
  'prompts',
  'assistant',
  '01-general-instructions.txt',
);

let cachedRegistry = null;
let cachedSlimPrompt = null;

/**
 * `ENABLE_CUSTOM_SKILLS=true` activates Anthropic Skills mode: custom skill
 * IDs from the registry get attached to outgoing requests, code execution
 * is registered as a tool, the container pre-warm endpoint provisions
 * containers, etc.
 *
 * When false, none of the Skills code path executes. The system can still
 * use the [DOCUMENT]-block parser path (see `documentBlocksEnabled`) or
 * fall back to plain chat with the hover-button conversion.
 */
function customSkillsEnabled() {
  return process.env.ENABLE_CUSTOM_SKILLS === 'true';
}

/**
 * `ENABLE_SLIM_PROMPT=true` swaps the full 174KB combined prompt for just
 * `01-general-instructions.txt`. Independent of Skills: you can run slim
 * with Skills off (the demo's hybrid mode) or with Skills on (current
 * Skills mode).
 *
 * Default: rides on `ENABLE_CUSTOM_SKILLS` for backward compatibility with
 * existing deployments.
 */
function slimPromptEnabled() {
  if (process.env.ENABLE_SLIM_PROMPT === 'true') return true;
  if (process.env.ENABLE_SLIM_PROMPT === 'false') return false;
  return customSkillsEnabled();
}

/**
 * `ENABLE_DOCUMENT_BLOCKS=true` turns on the streaming `[DOCUMENT]...
 * [/DOCUMENT]` parser. The block contents become a server-side
 * markdown→docx conversion, attached to the assistant message. When off,
 * the parser is bypassed entirely.
 */
function documentBlocksEnabled() {
  return process.env.ENABLE_DOCUMENT_BLOCKS === 'true';
}

function loadRegistry() {
  if (cachedRegistry !== null) return cachedRegistry;
  try {
    if (!fs.existsSync(REGISTRY_PATH)) {
      cachedRegistry = { skills: {} };
      return cachedRegistry;
    }
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    cachedRegistry = parsed && typeof parsed === 'object' ? parsed : { skills: {} };
    return cachedRegistry;
  } catch (error) {
    logger.warn(
      `[featureFlags] failed to load registry, falling back to empty: ${error?.message ?? error}`,
    );
    cachedRegistry = { skills: {} };
    return cachedRegistry;
  }
}

/**
 * Returns the array of custom-skill descriptors to attach to a request's
 * `container.skills` array, or [] if the registry is empty / Skills is
 * disabled.
 * @returns {Array<{ type: 'custom', skill_id: string, version: 'latest' }>}
 */
function getCustomSkills() {
  if (!customSkillsEnabled()) return [];
  const reg = loadRegistry();
  const out = [];
  for (const slug of Object.keys(reg.skills ?? {})) {
    const entry = reg.skills[slug];
    if (entry?.skill_id && typeof entry.skill_id === 'string') {
      out.push({ type: 'custom', skill_id: entry.skill_id, version: 'latest' });
    }
  }
  return out;
}

/**
 * Returns the slim system prompt content used when the slim prompt is
 * enabled, or null when it isn't (caller should fall back to whatever
 * prompt was already loaded from `promptPrefix`).
 * @returns {string | null}
 */
function getSlimSystemPrompt() {
  if (!slimPromptEnabled()) return null;
  if (typeof cachedSlimPrompt === 'string' && cachedSlimPrompt.length > 0) {
    return cachedSlimPrompt;
  }
  try {
    cachedSlimPrompt = fs.readFileSync(SLIM_PROMPT_PATH, 'utf8');
    return cachedSlimPrompt;
  } catch (error) {
    logger.warn(
      `[featureFlags] failed to load slim prompt: ${error?.message ?? error}`,
    );
    return null;
  }
}

module.exports = {
  customSkillsEnabled,
  slimPromptEnabled,
  documentBlocksEnabled,
  getCustomSkills,
  getSlimSystemPrompt,
};
