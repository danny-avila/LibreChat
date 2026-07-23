import { MAX_PATTERN_LENGTH, hasNestedQuantifier } from '@librechat/agents';
import type { HookEvent } from '@librechat/agents';
import type { PluginHookHandler, PluginHooksDocument } from './schema';

const EVENT_MAP = new Map<string, HookEvent>([
  ['RunStart', 'RunStart'],
  ['SessionStart', 'RunStart'],
  ['UserPromptSubmit', 'UserPromptSubmit'],
  ['PreToolUse', 'PreToolUse'],
  ['PostToolUse', 'PostToolUse'],
  ['PostToolUseFailure', 'PostToolUseFailure'],
  ['PostToolBatch', 'PostToolBatch'],
  ['PermissionDenied', 'PermissionDenied'],
  ['SubagentStart', 'SubagentStart'],
  ['SubagentStop', 'SubagentStop'],
  ['Stop', 'Stop'],
  ['StopFailure', 'StopFailure'],
  ['PreCompact', 'PreCompact'],
  ['PostCompact', 'PostCompact'],
]);

const QUERY_EVENTS = new Set<HookEvent>([
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
  'PermissionDenied',
  'SubagentStart',
  'SubagentStop',
]);

export type PluginHookIssueSeverity = 'warning' | 'error';

export type PluginHookIssueCode =
  | 'event_alias'
  | 'unsupported_event'
  | 'unsupported_handler'
  | 'invalid_matcher'
  | 'matcher_translated'
  | 'unmapped_matcher'
  | 'unsupported_matcher'
  | 'unsupported_condition'
  | 'conflicting_condition'
  | 'unsupported_async'
  | 'unsupported_async_rewake'
  | 'unsupported_session_lifecycle'
  | 'long_timeout';

export interface PluginHookCompatibilityIssue {
  code: PluginHookIssueCode;
  severity: PluginHookIssueSeverity;
  message: string;
}

export type PluginHookHandlerType = 'command' | 'prompt';

export interface PluginHookMatcherTranslation {
  sourceEvent: string;
  targetEvent: HookEvent;
  matcher: string;
}

export interface PluginHookCapabilities {
  handlerTypes: ReadonlySet<PluginHookHandlerType>;
  translateMatcher?: (input: PluginHookMatcherTranslation) => string | undefined;
  conditions?: boolean;
  async?: boolean;
  asyncRewake?: boolean;
  sessionLifecycle?: boolean;
}

export interface PluginHookPlanEntry {
  sourceEvent: string;
  targetEvent?: HookEvent;
  groupIndex: number;
  handlerIndex: number;
  sourceMatcher?: string;
  matcher?: string;
  condition?: string;
  timeoutMs?: number;
  handler: PluginHookHandler;
  status: 'ready' | 'unsupported';
  issues: PluginHookCompatibilityIssue[];
}

export interface PluginHookPlanSummary {
  declared: number;
  ready: number;
  unsupported: number;
}

export interface PluginHookPlan {
  description?: string;
  entries: PluginHookPlanEntry[];
  summary: PluginHookPlanSummary;
}

function normalizeMatcher(matcher: string | undefined): string | undefined {
  const trimmed = matcher?.trim();
  if (!trimmed || trimmed === '*') {
    return undefined;
  }
  return trimmed;
}

function getMatcherValidationIssue(
  matcher: string | undefined,
  targetEvent: HookEvent | undefined,
): PluginHookCompatibilityIssue | undefined {
  if (!matcher) {
    return undefined;
  }
  if (targetEvent && !QUERY_EVENTS.has(targetEvent)) {
    return {
      code: 'unsupported_matcher',
      severity: 'error',
      message: `${targetEvent} does not expose a matcher query in the LibreChat hook runtime`,
    };
  }
  if (matcher.length > MAX_PATTERN_LENGTH || hasNestedQuantifier(matcher)) {
    return {
      code: 'invalid_matcher',
      severity: 'error',
      message: 'Matcher exceeds the safe regex limits enforced by the LibreChat hook runtime',
    };
  }
  try {
    void new RegExp(matcher);
    return undefined;
  } catch {
    return {
      code: 'invalid_matcher',
      severity: 'error',
      message: 'Matcher is not a valid regular expression',
    };
  }
}

function getEventIssues(
  sourceEvent: string,
  targetEvent: HookEvent | undefined,
  capabilities: PluginHookCapabilities,
): PluginHookCompatibilityIssue[] {
  if (!targetEvent) {
    return [
      {
        code: 'unsupported_event',
        severity: 'error',
        message: `${sourceEvent} has no equivalent LibreChat lifecycle event`,
      },
    ];
  }
  if (sourceEvent !== 'SessionStart') {
    return [];
  }
  if (capabilities.sessionLifecycle !== true) {
    return [
      {
        code: 'unsupported_session_lifecycle',
        severity: 'error',
        message: 'SessionStart requires a runtime that deduplicates RunStart by plugin session',
      },
    ];
  }
  return [
    {
      code: 'event_alias',
      severity: 'warning',
      message: 'SessionStart maps to RunStart with runtime-provided once-per-session semantics',
    },
  ];
}

function getHandlerIssues(
  handler: PluginHookHandler,
  capabilities: PluginHookCapabilities,
): PluginHookCompatibilityIssue[] {
  const issues: PluginHookCompatibilityIssue[] = [];
  const supportedHandlerType =
    handler.type === 'command' || handler.type === 'prompt' ? handler.type : undefined;
  if (!supportedHandlerType || !capabilities.handlerTypes.has(supportedHandlerType)) {
    issues.push({
      code: 'unsupported_handler',
      severity: 'error',
      message: `The configured executor does not support ${handler.type} hook handlers`,
    });
  }
  if (handler.async === true && capabilities.async !== true) {
    issues.push({
      code: 'unsupported_async',
      severity: 'error',
      message: 'The configured executor does not support asynchronous hook execution',
    });
  }
  if (handler.asyncRewake === true && capabilities.asyncRewake !== true) {
    issues.push({
      code: 'unsupported_async_rewake',
      severity: 'error',
      message: 'The configured executor does not support asyncRewake',
    });
  }
  if ((handler.timeout ?? 0) > 600) {
    issues.push({
      code: 'long_timeout',
      severity: 'warning',
      message: 'Hook timeout exceeds the portable 600-second compatibility target',
    });
  }
  return issues;
}

interface MatcherPlan {
  sourceMatcher?: string;
  matcher?: string;
  issues: PluginHookCompatibilityIssue[];
}

function planMatcher(
  sourceEvent: string,
  targetEvent: HookEvent | undefined,
  configuredMatcher: string | undefined,
  capabilities: PluginHookCapabilities,
): MatcherPlan {
  const sourceMatcher = normalizeMatcher(configuredMatcher);
  if (!sourceMatcher) {
    return { issues: [] };
  }
  const validationIssue = getMatcherValidationIssue(sourceMatcher, targetEvent);
  if (validationIssue?.code === 'unsupported_matcher' || !targetEvent) {
    return {
      sourceMatcher,
      matcher: sourceMatcher,
      issues: validationIssue ? [validationIssue] : [],
    };
  }
  if (!capabilities.translateMatcher) {
    return {
      sourceMatcher,
      issues: [
        {
          code: 'unmapped_matcher',
          severity: 'error',
          message: 'Plugin matcher namespaces require an explicit LibreChat query translation',
        },
      ],
    };
  }

  let matcher: string | undefined;
  try {
    matcher = capabilities.translateMatcher({
      sourceEvent,
      targetEvent,
      matcher: sourceMatcher,
    });
  } catch {
    matcher = undefined;
  }
  if (!matcher?.trim()) {
    return {
      sourceMatcher,
      issues: [
        {
          code: 'unmapped_matcher',
          severity: 'error',
          message: 'The configured matcher translator could not map this plugin matcher',
        },
      ],
    };
  }

  const issues: PluginHookCompatibilityIssue[] = [];
  const translatedValidationIssue = getMatcherValidationIssue(matcher, targetEvent);
  if (translatedValidationIssue) {
    issues.push(translatedValidationIssue);
  }
  if (matcher !== sourceMatcher) {
    issues.push({
      code: 'matcher_translated',
      severity: 'warning',
      message: `Plugin matcher "${sourceMatcher}" maps to LibreChat matcher "${matcher}"`,
    });
  }
  return { sourceMatcher, matcher, issues };
}

function hasError(issues: readonly PluginHookCompatibilityIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}

export function planPluginHooks(
  document: PluginHooksDocument,
  capabilities: PluginHookCapabilities,
): PluginHookPlan {
  const entries: PluginHookPlanEntry[] = [];
  const summary: PluginHookPlanSummary = { declared: 0, ready: 0, unsupported: 0 };

  for (const [sourceEvent, groups] of Object.entries(document.hooks)) {
    const targetEvent = EVENT_MAP.get(sourceEvent);
    const eventIssues = getEventIssues(sourceEvent, targetEvent, capabilities);

    for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
      const group = groups[groupIndex];
      const matcherPlan = planMatcher(sourceEvent, targetEvent, group.matcher, capabilities);
      const groupIssues = [...eventIssues, ...matcherPlan.issues];

      for (let handlerIndex = 0; handlerIndex < group.hooks.length; handlerIndex++) {
        const handler = group.hooks[handlerIndex];
        const issues = [...groupIssues, ...getHandlerIssues(handler, capabilities)];
        const condition = handler.if ?? group.if;
        if (handler.if && group.if && handler.if !== group.if) {
          issues.push({
            code: 'conflicting_condition',
            severity: 'error',
            message: 'A hook cannot combine different group-level and handler-level conditions',
          });
        }
        if (condition && capabilities.conditions !== true) {
          issues.push({
            code: 'unsupported_condition',
            severity: 'error',
            message: 'The configured executor does not support conditional `if` hook expressions',
          });
        }
        const status = hasError(issues) ? 'unsupported' : 'ready';

        entries.push({
          sourceEvent,
          targetEvent,
          groupIndex,
          handlerIndex,
          ...(matcherPlan.sourceMatcher !== undefined && {
            sourceMatcher: matcherPlan.sourceMatcher,
          }),
          ...(matcherPlan.matcher !== undefined && { matcher: matcherPlan.matcher }),
          ...(condition !== undefined && { condition }),
          handler,
          status,
          issues,
          ...(handler.timeout !== undefined && { timeoutMs: handler.timeout * 1_000 }),
        });
        summary.declared++;
        summary[status === 'ready' ? 'ready' : 'unsupported']++;
      }
    }
  }

  return {
    ...(document.description !== undefined && { description: document.description }),
    entries,
    summary,
  };
}
