import { TPreset } from '../types';

export type PresetDeleteResponse = {
  acknowledged: boolean;
  deletedCount: number;
};

export type UpdatePresetOptions = {
  onSuccess?: (data: TPreset, variables: TPreset, context?: unknown) => void;
  onMutate?: (variables: TPreset) => void | Promise<unknown>;
  onError?: (error: unknown, variables: TPreset, context?: unknown) => void;
};

export type DeletePresetOptions = {
  onSuccess?: (
    data: PresetDeleteResponse,
    variables: TPreset | undefined,
    context?: unknown,
  ) => void;
  onMutate?: (variables: TPreset | undefined) => void | Promise<unknown>;
  onError?: (error: unknown, variables: TPreset | undefined, context?: unknown) => void;
};

export type LogoutOptions = {
  onSuccess?: (data: unknown, variables: undefined, context?: unknown) => void;
  onMutate?: (variables: undefined) => void | Promise<unknown>;
  onError?: (error: unknown, variables: undefined, context?: unknown) => void;
};
