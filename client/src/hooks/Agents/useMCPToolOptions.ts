import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AgentToolOptions, AllowedCaller, AgentToolType } from 'librechat-data-provider';
import type { UseFormGetValues, UseFormSetValue } from 'react-hook-form';
import type { AgentForm } from '~/common';

type BooleanToolOptionKey = 'defer_loading' | 'run_in_background';

interface BooleanOptionHandlers {
  isSet: (toolId: string) => boolean;
  toggle: (toolId: string) => void;
  areAllSet: (tools: AgentToolType[]) => boolean;
  toggleAll: (tools: AgentToolType[]) => void;
}

interface ToolOptionsFormContext {
  formToolOptions: AgentToolOptions | undefined;
  getValues: UseFormGetValues<AgentForm>;
  setValue: UseFormSetValue<AgentForm>;
}

interface UseMCPToolOptionsReturn {
  formToolOptions: AgentToolOptions | undefined;
  isToolDeferred: (toolId: string) => boolean;
  isToolProgrammatic: (toolId: string) => boolean;
  isToolBackground: (toolId: string) => boolean;
  toggleToolDefer: (toolId: string) => void;
  toggleToolProgrammatic: (toolId: string) => void;
  toggleToolBackground: (toolId: string) => void;
  areAllToolsDeferred: (tools: AgentToolType[]) => boolean;
  areAllToolsProgrammatic: (tools: AgentToolType[]) => boolean;
  areAllToolsBackground: (tools: AgentToolType[]) => boolean;
  toggleDeferAll: (tools: AgentToolType[]) => void;
  toggleProgrammaticAll: (tools: AgentToolType[]) => void;
  toggleBackgroundAll: (tools: AgentToolType[]) => void;
}

/**
 * Sets or clears a boolean flag on one tool's options without mutating the
 * previous objects (react-hook-form still holds them); dropping the last flag
 * removes the tool's entry entirely.
 */
export function withBooleanOption(
  options: AgentToolOptions,
  toolId: string,
  key: BooleanToolOptionKey,
  set: boolean,
): AgentToolOptions {
  const updatedOptions: AgentToolOptions = { ...options };
  const currentToolOptions = updatedOptions[toolId];
  if (set) {
    updatedOptions[toolId] = { ...currentToolOptions, [key]: true };
    return updatedOptions;
  }
  if (!currentToolOptions) {
    return updatedOptions;
  }
  const { [key]: _omit, ...restOptions } = currentToolOptions;
  if (Object.keys(restOptions).length === 0) {
    delete updatedOptions[toolId];
  } else {
    updatedOptions[toolId] = restOptions;
  }
  return updatedOptions;
}

/** Read/toggle handlers for one boolean per-tool option key (single + bulk). */
function useBooleanToolOption(
  key: BooleanToolOptionKey,
  { formToolOptions, getValues, setValue }: ToolOptionsFormContext,
): BooleanOptionHandlers {
  const isSet = useCallback(
    (toolId: string): boolean => formToolOptions?.[toolId]?.[key] === true,
    [formToolOptions, key],
  );

  const toggle = useCallback(
    (toolId: string) => {
      const currentOptions = getValues('tool_options') || {};
      const set = currentOptions[toolId]?.[key] !== true;
      setValue('tool_options', withBooleanOption(currentOptions, toolId, key, set), {
        shouldDirty: true,
      });
    },
    [getValues, setValue, key],
  );

  const areAllSet = useCallback(
    (tools: AgentToolType[]): boolean =>
      tools.length > 0 && tools.every((tool) => formToolOptions?.[tool.tool_id]?.[key] === true),
    [formToolOptions, key],
  );

  const toggleAll = useCallback(
    (tools: AgentToolType[]) => {
      if (tools.length === 0) {
        return;
      }
      const set = !areAllSet(tools);
      let updatedOptions = getValues('tool_options') || {};
      for (const tool of tools) {
        updatedOptions = withBooleanOption(updatedOptions, tool.tool_id, key, set);
      }
      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [areAllSet, getValues, setValue, key],
  );

  return { isSet, toggle, areAllSet, toggleAll };
}

export default function useMCPToolOptions(): UseMCPToolOptionsReturn {
  const { getValues, setValue, control } = useFormContext<AgentForm>();
  const formToolOptions = useWatch({ control, name: 'tool_options' });
  const formContext: ToolOptionsFormContext = { formToolOptions, getValues, setValue };

  const defer = useBooleanToolOption('defer_loading', formContext);
  const background = useBooleanToolOption('run_in_background', formContext);

  /** `allowed_callers` is array-valued, so the programmatic family stays bespoke. */
  const isToolProgrammatic = useCallback(
    (toolId: string): boolean =>
      formToolOptions?.[toolId]?.allowed_callers?.includes('code_execution') === true,
    [formToolOptions],
  );

  const toggleToolProgrammatic = useCallback(
    (toolId: string) => {
      const currentOptions = getValues('tool_options') || {};
      const currentToolOptions = currentOptions[toolId] || {};
      const currentCallers = currentToolOptions.allowed_callers || [];
      const isProgrammatic = currentCallers.includes('code_execution');

      const updatedOptions: AgentToolOptions = { ...currentOptions };

      if (isProgrammatic) {
        const newCallers = currentCallers.filter((c: AllowedCaller) => c !== 'code_execution');
        if (newCallers.length === 0) {
          const { allowed_callers: _, ...restOptions } = currentToolOptions;
          if (Object.keys(restOptions).length === 0) {
            delete updatedOptions[toolId];
          } else {
            updatedOptions[toolId] = restOptions;
          }
        } else {
          updatedOptions[toolId] = {
            ...currentToolOptions,
            allowed_callers: newCallers,
          };
        }
      } else {
        updatedOptions[toolId] = {
          ...currentToolOptions,
          allowed_callers: ['code_execution'] as AllowedCaller[],
        };
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue],
  );

  const areAllToolsProgrammatic = useCallback(
    (tools: AgentToolType[]): boolean =>
      tools.length > 0 &&
      tools.every(
        (tool) =>
          formToolOptions?.[tool.tool_id]?.allowed_callers?.includes('code_execution') === true,
      ),
    [formToolOptions],
  );

  const toggleProgrammaticAll = useCallback(
    (tools: AgentToolType[]) => {
      if (tools.length === 0) {
        return;
      }

      const shouldBeProgrammatic = !areAllToolsProgrammatic(tools);
      const currentOptions = getValues('tool_options') || {};
      const updatedOptions: AgentToolOptions = { ...currentOptions };

      for (const tool of tools) {
        const currentToolOptions = updatedOptions[tool.tool_id];
        if (shouldBeProgrammatic) {
          updatedOptions[tool.tool_id] = {
            ...currentToolOptions,
            allowed_callers: ['code_execution'] as AllowedCaller[],
          };
          continue;
        }
        if (!currentToolOptions) {
          continue;
        }
        const { allowed_callers: _, ...restOptions } = currentToolOptions;
        if (Object.keys(restOptions).length === 0) {
          delete updatedOptions[tool.tool_id];
        } else {
          updatedOptions[tool.tool_id] = restOptions;
        }
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue, areAllToolsProgrammatic],
  );

  return {
    formToolOptions,
    isToolDeferred: defer.isSet,
    isToolProgrammatic,
    isToolBackground: background.isSet,
    toggleToolDefer: defer.toggle,
    toggleToolProgrammatic,
    toggleToolBackground: background.toggle,
    areAllToolsDeferred: defer.areAllSet,
    areAllToolsProgrammatic,
    areAllToolsBackground: background.areAllSet,
    toggleDeferAll: defer.toggleAll,
    toggleProgrammaticAll,
    toggleBackgroundAll: background.toggleAll,
  };
}
