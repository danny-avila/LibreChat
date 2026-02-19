import { useCallback } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { AgentToolOptions, AllowedCaller, AgentToolType } from 'librechat-data-provider';
import type { AgentForm } from '~/common';

interface UseMCPToolOptionsReturn {
  formToolOptions: AgentToolOptions | undefined;
  isToolDeferred: (toolId: string) => boolean;
  isToolProgrammatic: (toolId: string) => boolean;
  toggleToolDefer: (toolId: string) => void;
  toggleToolProgrammatic: (toolId: string) => void;
  areAllToolsDeferred: (tools: AgentToolType[]) => boolean;
  areAllToolsProgrammatic: (tools: AgentToolType[]) => boolean;
  toggleDeferAll: (tools: AgentToolType[]) => void;
  toggleProgrammaticAll: (tools: AgentToolType[]) => void;
}

export default function useMCPToolOptions(): UseMCPToolOptionsReturn {
  const { getValues, setValue, control } = useFormContext<AgentForm>();
  const formToolOptions = useWatch({ control, name: 'tool_options' });

  const isToolDeferred = useCallback(
    (toolId: string): boolean => formToolOptions?.[toolId]?.defer_loading === true,
    [formToolOptions],
  );

  const isToolProgrammatic = useCallback(
    (toolId: string): boolean =>
      formToolOptions?.[toolId]?.allowed_callers?.includes('code_execution') === true,
    [formToolOptions],
  );

  const toggleToolDefer = useCallback(
    (toolId: string) => {
      const currentOptions = getValues('tool_options') || {};
      const currentToolOptions = currentOptions[toolId] || {};
      const newDeferred = !currentToolOptions.defer_loading;

      const updatedOptions: AgentToolOptions = { ...currentOptions };

      if (newDeferred) {
        updatedOptions[toolId] = {
          ...currentToolOptions,
          defer_loading: true,
        };
      } else {
        const { defer_loading: _, ...restOptions } = currentToolOptions;
        if (Object.keys(restOptions).length === 0) {
          delete updatedOptions[toolId];
        } else {
          updatedOptions[toolId] = restOptions;
        }
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue],
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

  const areAllToolsDeferred = useCallback(
    (tools: AgentToolType[]): boolean =>
      tools.length > 0 &&
      tools.every((tool) => formToolOptions?.[tool.tool_id]?.defer_loading === true),
    [formToolOptions],
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

  const toggleDeferAll = useCallback(
    (tools: AgentToolType[]) => {
      if (tools.length === 0) return;

      const shouldDefer = !areAllToolsDeferred(tools);
      const currentOptions = getValues('tool_options') || {};
      const updatedOptions: AgentToolOptions = { ...currentOptions };

      for (const tool of tools) {
        if (shouldDefer) {
          updatedOptions[tool.tool_id] = {
            ...(updatedOptions[tool.tool_id] || {}),
            defer_loading: true,
          };
        } else {
          if (updatedOptions[tool.tool_id]) {
            delete updatedOptions[tool.tool_id].defer_loading;
            if (Object.keys(updatedOptions[tool.tool_id]).length === 0) {
              delete updatedOptions[tool.tool_id];
            }
          }
        }
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue, areAllToolsDeferred],
  );

  const toggleProgrammaticAll = useCallback(
    (tools: AgentToolType[]) => {
      if (tools.length === 0) return;

      const shouldBeProgrammatic = !areAllToolsProgrammatic(tools);
      const currentOptions = getValues('tool_options') || {};
      const updatedOptions: AgentToolOptions = { ...currentOptions };

      for (const tool of tools) {
        const currentToolOptions = updatedOptions[tool.tool_id] || {};
        if (shouldBeProgrammatic) {
          updatedOptions[tool.tool_id] = {
            ...currentToolOptions,
            allowed_callers: ['code_execution'] as AllowedCaller[],
          };
        } else {
          if (updatedOptions[tool.tool_id]) {
            delete updatedOptions[tool.tool_id].allowed_callers;
            if (Object.keys(updatedOptions[tool.tool_id]).length === 0) {
              delete updatedOptions[tool.tool_id];
            }
          }
        }
      }

      setValue('tool_options', updatedOptions, { shouldDirty: true });
    },
    [getValues, setValue, areAllToolsProgrammatic],
  );

  return {
    formToolOptions,
    isToolDeferred,
    isToolProgrammatic,
    toggleToolDefer,
    toggleToolProgrammatic,
    areAllToolsDeferred,
    areAllToolsProgrammatic,
    toggleDeferAll,
    toggleProgrammaticAll,
  };
}
