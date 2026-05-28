import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, Info } from 'lucide-react';
import keyBy from 'lodash/keyBy';
import {
  Switch,
  useToastContext,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  TooltipAnchor,
  ControlCombobox,
} from '@librechat/client';
import { Controller, useWatch, useFormContext } from 'react-hook-form';
import {
  EModelEndpoint,
  SystemRoles,
  PermissionTypes,
  Permissions,
  getEndpointField,
  getSettingsKeys,
  agentParamSettings,
  LocalStorageKeys,
  SettingDefinition,
} from 'librechat-data-provider';
import { useGetModelsQuery } from 'librechat-data-provider/react-query';
import type * as t from 'librechat-data-provider';
import type { AgentForm, IconComponentTypes, StringOption } from '~/common';
import {
  removeFocusOutlines,
  processAgentOption,
  defaultTextProps,
  validateEmail,
  getIconKey,
  getModelDisplayName,
  getEndpointAlternateName,
  createProviderOption,
  cn,
} from '~/utils';
import { ToolSelectDialog, MCPToolSelectDialog } from '~/components/Tools';
import { SkillSelectDialog } from '~/components/Skills/dialogs';
import useAgentCapabilities from '~/hooks/Agents/useAgentCapabilities';
import { useFileMapContext, useAgentPanelContext } from '~/Providers';
import AgentCategorySelector from './AgentCategorySelector';
import Action from '~/components/SidePanel/Builder/Action';
import { useLocalize, useVisibleTools, useHasAccess, useAuthContext } from '~/hooks';
import { Panel, isEphemeralAgent } from '~/common';
import { useListSkillsQuery, useGetAgentFiles } from '~/data-provider';
import { componentMapping } from '~/components/SidePanel/Parameters/components';
import { icons } from '~/hooks/Endpoint/Icons';
import Instructions from './Instructions';
import AdminSettings from './AdminSettings';
import FileSearch from './FileSearch';
import Artifacts from './Artifacts';
import AgentTool from './AgentTool';
import CodeForm from './Code/Form';
import MCPTools from './MCPTools';

// V1 UX (POP/BETC) : ID technique agent_XXX masqué sous le champ Nom —
// bruit visuel sans utilité métier. Réactiver en passant à `true` ; le
// champ id reste dans le formulaire et le data model côté backend.
const SHOW_AGENT_ID = false;

// V1 UX (POP/BETC) : paramètres essentiels du modèle visibles inline dans
// le builder agent (Créativité, Resend Files, Thinking, Recherche web —
// selon provider). Reste des params en accordéon « Paramètres avancés ».
// Pattern aligné sur le panel Paramètres conversation (commit a98a8d6cd).
const ESSENTIAL_PARAM_KEYS = ['temperature', 'resendFiles', 'thinking', 'web_search'];

const labelClass = 'mb-2 text-token-text-primary block text-sm font-medium';
const inputClass = cn(
  defaultTextProps,
  'flex w-full px-3 py-2 border-border-light bg-surface-secondary focus-visible:ring-2 focus-visible:ring-ring-primary',
  removeFocusOutlines,
);

export default function AgentConfig() {
  const localize = useLocalize();
  const { user } = useAuthContext();
  const fileMap = useFileMapContext();
  const { showToast } = useToastContext();
  const methods = useFormContext<AgentForm>();
  const [showToolDialog, setShowToolDialog] = useState(false);
  const [showMCPToolDialog, setShowMCPToolDialog] = useState(false);
  const [showSkillDialog, setShowSkillDialog] = useState(false);
  const {
    actions,
    setAction,
    regularTools,
    agentsConfig,
    availableMCPServers,
    mcpServersMap,
    setActivePanel,
    endpointsConfig,
  } = useAgentPanelContext();

  const {
    control,
    formState: { errors },
  } = methods;
  const provider = useWatch({ control, name: 'provider' });
  const model = useWatch({ control, name: 'model' });
  const agent = useWatch({ control, name: 'agent' });
  const tools = useWatch({ control, name: 'tools' });
  const skills = useWatch({ control, name: 'skills' });
  const skillsActive = useWatch({ control, name: 'skills_enabled' });
  const agent_id = useWatch({ control, name: 'id' });

  let skillsHintKey:
    | 'com_ui_skills_disabled_hint'
    | 'com_ui_skills_enabled_allowlist_hint'
    | 'com_ui_skills_enabled_all_hint' = 'com_ui_skills_disabled_hint';
  if (skillsActive === true) {
    skillsHintKey =
      (skills ?? []).length > 0
        ? 'com_ui_skills_enabled_allowlist_hint'
        : 'com_ui_skills_enabled_all_hint';
  }

  const {
    codeEnabled,
    toolsEnabled,
    contextEnabled,
    actionsEnabled,
    skillsEnabled,
    artifactsEnabled,
    fileSearchEnabled,
  } = useAgentCapabilities(agentsConfig?.capabilities);

  const hasSkillsAccess = useHasAccess({
    permissionType: PermissionTypes.SKILLS,
    permission: Permissions.USE,
  });
  const showSkills = hasSkillsAccess && skillsEnabled;
  const { data: skillsData } = useListSkillsQuery({ limit: 100 }, { enabled: showSkills });
  const skillsMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const skill of skillsData?.skills ?? []) {
      map.set(skill._id, skill.name);
    }
    return map;
  }, [skillsData?.skills]);

  const { data: agentFiles = [] } = useGetAgentFiles(agent_id);

  const mergedFileMap = useMemo(() => {
    const newFileMap = { ...fileMap };
    agentFiles.forEach((file) => {
      if (file.file_id) {
        newFileMap[file.file_id] = file;
      }
    });
    return newFileMap;
  }, [fileMap, agentFiles]);

  const context_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.context_files) {
      return agent.context_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap: mergedFileMap,
    });
    return _agent.context_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

  const knowledge_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.knowledge_files) {
      return agent.knowledge_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap: mergedFileMap,
    });
    return _agent.knowledge_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

  const code_files = useMemo(() => {
    if (typeof agent === 'string') {
      return [];
    }

    if (agent?.id !== agent_id) {
      return [];
    }

    if (agent.code_files) {
      return agent.code_files;
    }

    const _agent = processAgentOption({
      agent,
      fileMap: mergedFileMap,
    });
    return _agent.code_files ?? [];
  }, [agent, agent_id, mergedFileMap]);

  const handleAddActions = useCallback(() => {
    if (isEphemeralAgent(agent_id)) {
      showToast({
        message: localize('com_assistants_actions_disabled'),
        status: 'warning',
      });
      return;
    }
    setActivePanel(Panel.actions);
  }, [agent_id, setActivePanel, showToast, localize]);

  const providerValue = typeof provider === 'string' ? provider : provider?.value;
  let Icon: IconComponentTypes | null | undefined;
  let endpointType: EModelEndpoint | undefined;
  let endpointIconURL: string | undefined;
  let iconKey: string | undefined;

  if (providerValue !== undefined) {
    endpointType = getEndpointField(endpointsConfig, providerValue as string, 'type');
    endpointIconURL = getEndpointField(endpointsConfig, providerValue as string, 'iconURL');
    iconKey = getIconKey({
      endpoint: providerValue as string,
      endpointsConfig,
      endpointType,
      endpointIconURL,
    });
    Icon = icons[providerValue as string] ?? icons[iconKey];
  }

  const { toolIds, mcpServerNames } = useVisibleTools(tools, regularTools, mcpServersMap);

  // V1 UX (POP/BETC) : dropdowns Provider/Model + grille de paramètres
  // inline dans la page principale du builder (cf. refonte commit dédié).
  const modelsQuery = useGetModelsQuery({ refetchOnMount: 'always' });
  const modelsData = useMemo(() => modelsQuery.data ?? {}, [modelsQuery.data]);

  const allowedProviders = useMemo(
    () => new Set(agentsConfig?.allowedProviders),
    [agentsConfig?.allowedProviders],
  );

  const providers = useMemo(
    () =>
      Object.keys(endpointsConfig ?? {})
        .filter(
          (key) =>
            key !== EModelEndpoint.agents &&
            (allowedProviders.size > 0 ? allowedProviders.has(key) : true),
        )
        .map((p) => createProviderOption(p)),
    [endpointsConfig, allowedProviders],
  );

  const models = useMemo(
    () => (providerValue ? (modelsData[providerValue as string] ?? []) : []),
    [modelsData, providerValue],
  );

  useEffect(() => {
    const _model = model ?? '';
    if (providerValue && _model) {
      const modelExists = models.includes(_model);
      if (!modelExists) {
        const newModels = modelsData[providerValue as string] ?? [];
        methods.setValue('model', newModels[0] ?? '');
      }
      localStorage.setItem(LocalStorageKeys.LAST_AGENT_MODEL, _model);
      localStorage.setItem(LocalStorageKeys.LAST_AGENT_PROVIDER, providerValue as string);
    }
    if (providerValue && !_model) {
      methods.setValue('model', models[0] ?? '');
    }
  }, [providerValue, models, modelsData, methods, model]);

  const bedrockRegions = useMemo(
    () => endpointsConfig?.[providerValue as string]?.availableRegions ?? [],
    [endpointsConfig, providerValue],
  );

  // Calcul essentiels + avancés selon provider/model.
  // Gating endpoint custom sur web_search uniquement (cohérent a98a8d6cd) :
  // les endpoints custom (ex. French Models/Featherless) ne supportent pas
  // le tool web_search natif → 400 garanti si activé.
  const { essentialParams, advancedParams } = useMemo(() => {
    const customParams = endpointsConfig?.[providerValue as string]?.customParams ?? {};
    const [combinedKey, endpointKey] = getSettingsKeys(
      endpointType ?? (providerValue as string) ?? '',
      model ?? '',
    );
    const overriddenEndpointKey = customParams.defaultParamsEndpoint ?? endpointKey;
    const defaultParams =
      agentParamSettings[combinedKey] ?? agentParamSettings[overriddenEndpointKey] ?? [];
    const overriddenParams =
      endpointsConfig?.[providerValue as string]?.customParams?.paramDefinitions ?? [];
    const overriddenParamsMap = keyBy(overriddenParams, 'key');
    const parameters = defaultParams
      .filter((param) => param != null)
      .filter(
        (param) => param.key !== 'web_search' || endpointType !== EModelEndpoint.custom,
      )
      .map((param) => (overriddenParamsMap[param.key] as SettingDefinition) ?? param);

    const essentialByKey = new Map<string, SettingDefinition>();
    const advanced: SettingDefinition[] = [];
    for (const param of parameters) {
      if (ESSENTIAL_PARAM_KEYS.includes(param.key)) {
        essentialByKey.set(param.key, param);
      } else {
        advanced.push(param);
      }
    }
    const ordered = ESSENTIAL_PARAM_KEYS.map((k) => essentialByKey.get(k)).filter(
      (p): p is SettingDefinition => p != null,
    );
    return { essentialParams: ordered, advancedParams: advanced };
  }, [endpointType, endpointsConfig, model, providerValue]);

  const modelParameters = useWatch({ control, name: 'model_parameters' });

  // Nettoyage : si l'utilisateur bascule vers un endpoint custom alors que
  // web_search était activé, on retire le param pour éviter un 400 au prochain
  // appel LLM (pattern Panel.tsx:177-229 côté conversation).
  useEffect(() => {
    if (endpointType !== EModelEndpoint.custom) return;
    const ws = (modelParameters as { web_search?: boolean } | undefined)?.web_search;
    if (ws != null) {
      methods.setValue('model_parameters.web_search' as never, undefined as never, {
        shouldDirty: true,
      });
    }
  }, [endpointType, modelParameters, methods]);

  const setOption =
    (optionKey: keyof t.AgentModelParameters) => (value: t.AgentParameterValue) => {
      methods.setValue(`model_parameters.${optionKey}`, value);
    };

  const renderParam = (setting: SettingDefinition) => {
    const Component = componentMapping[setting.component];
    if (!Component) return null;
    const { key, default: defaultValue, ...rest } = setting;
    if (key === 'region' && bedrockRegions.length) {
      rest.options = bedrockRegions;
    }
    return (
      <Component
        key={key}
        settingKey={key}
        defaultValue={defaultValue}
        {...rest}
        setOption={setOption as t.TSetOption}
        conversation={modelParameters as Partial<t.TConversation>}
      />
    );
  };

  return (
    <>
      <div className="h-auto pt-1">
        {/* Name */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="name">
            {localize('com_ui_name')}
            <span className="text-red-500">*</span>
          </label>
          <Controller
            name="name"
            rules={{ required: localize('com_ui_agent_name_is_required') }}
            control={control}
            render={({ field }) => (
              <>
                <input
                  {...field}
                  value={field.value ?? ''}
                  maxLength={256}
                  className={inputClass}
                  id="name"
                  type="text"
                  placeholder={localize('com_agents_name_placeholder')}
                  aria-label={localize('com_ui_agent_name')}
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'agent-name-error' : undefined}
                />
                {errors.name && (
                  <div
                    id="agent-name-error"
                    className="mt-1 w-56 text-sm text-red-500"
                    role="alert"
                  >
                    {errors.name.message}
                  </div>
                )}
              </>
            )}
          />
          {SHOW_AGENT_ID && (
            <Controller
              name="id"
              control={control}
              render={({ field }) => (
                <p className="h-3 text-xs italic text-text-secondary" aria-live="polite">
                  {field.value}
                </p>
              )}
            />
          )}
        </div>
        {/* Description */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="description">
            {localize('com_ui_description')}
          </label>
          <Controller
            name="description"
            control={control}
            render={({ field }) => (
              <input
                {...field}
                value={field.value ?? ''}
                maxLength={512}
                className={inputClass}
                id="description"
                type="text"
                placeholder={localize('com_agents_description_placeholder')}
                aria-label={localize('com_ui_agent_description')}
              />
            )}
          />
        </div>
        {/* Category */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="category-selector">
            {localize('com_ui_category')} <span className="text-red-500">*</span>
          </label>
          <AgentCategorySelector className="w-full" />
        </div>
        {/* Fournisseur (Provider) */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="provider">
            {localize('com_ui_provider')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="provider"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => {
              const value =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.value ?? '');
              const display =
                typeof field.value === 'string'
                  ? field.value
                  : ((field.value as StringOption)?.label ?? '');
              return (
                <>
                  <ControlCombobox
                    selectedValue={value}
                    displayValue={getEndpointAlternateName(display, localize) ?? display}
                    selectPlaceholder={localize('com_ui_select_provider')}
                    searchPlaceholder={localize('com_ui_select_search_provider')}
                    setValue={field.onChange}
                    items={providers.map((provider) => ({
                      label: typeof provider === 'string' ? provider : provider.label,
                      value: typeof provider === 'string' ? provider : provider.value,
                    }))}
                    className={cn(error ? 'border-2 border-red-500' : '')}
                    ariaLabel={localize('com_ui_provider')}
                    isCollapsed={false}
                    showCarat={true}
                  />
                  {error && (
                    <span className="text-sm text-red-500">
                      {localize('com_ui_field_required')}
                    </span>
                  )}
                </>
              );
            }}
          />
        </div>
        {/* Modèle */}
        <div className="mb-4">
          <label className={labelClass} htmlFor="model">
            {localize('com_ui_model')} <span className="text-red-500">*</span>
          </label>
          <Controller
            name="model"
            control={control}
            rules={{ required: true, minLength: 1 }}
            render={({ field, fieldState: { error } }) => (
              <>
                <ControlCombobox
                  selectedValue={field.value || ''}
                  displayValue={
                    field.value ? getModelDisplayName(field.value, localize).dropdownLabel : ''
                  }
                  selectPlaceholder={
                    providerValue
                      ? localize('com_ui_select_model')
                      : localize('com_ui_select_provider_first')
                  }
                  searchPlaceholder={localize('com_ui_select_model')}
                  setValue={field.onChange}
                  items={models.map((m) => ({
                    label: getModelDisplayName(m, localize).dropdownLabel,
                    value: m,
                  }))}
                  disabled={!providerValue}
                  className={cn('disabled:opacity-50', error ? 'border-2 border-red-500' : '')}
                  ariaLabel={localize('com_ui_model')}
                  isCollapsed={false}
                  showCarat={true}
                />
                {providerValue && error && (
                  <span className="text-sm text-red-500">
                    {localize('com_ui_field_required')}
                  </span>
                )}
              </>
            )}
          />
        </div>
        {/* Paramètres essentiels du modèle (inline) */}
        {essentialParams.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-2 gap-4">{essentialParams.map(renderParam)}</div>
          </div>
        )}
        {/* Paramètres avancés du modèle (accordéon replié) */}
        {advancedParams.length > 0 && (
          <Accordion type="single" collapsible className="mb-4 w-full">
            <AccordionItem value="model-advanced-params" className="border-b-0">
              <AccordionTrigger className="text-sm font-medium text-text-primary hover:no-underline">
                {localize('com_ui_advanced_settings')}
              </AccordionTrigger>
              <AccordionContent>
                <div className="grid grid-cols-2 gap-4 pt-2">
                  {advancedParams.map(renderParam)}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        )}
        {/* Instructions */}
        <Instructions />
        {/* Fichiers de référence */}
        {fileSearchEnabled && (
          <div className="mb-4">
            <label className={labelClass}>{localize('com_ui_reference_files')}</label>
            <FileSearch agent_id={agent_id} files={knowledge_files} />
          </div>
        )}
        {/* === SECTION 4 : Outils avancés (Accordion replié par défaut) === */}
        <Accordion type="single" collapsible className="mb-4 w-full">
          <AccordionItem value="advanced-tools" className="border-b-0">
            <AccordionTrigger className="text-sm font-medium text-text-primary hover:no-underline">
              <div className="flex items-center gap-2">
                <span>{localize('com_ui_advanced_tools')}</span>
                <TooltipAnchor
                  description={localize('com_ui_advanced_tools_desc')}
                  className="inline-flex"
                  render={
                    <Info
                      className="size-4 text-text-secondary"
                      aria-label={localize('com_ui_advanced_tools_desc')}
                    />
                  }
                />
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col gap-3 pt-2">
                {codeEnabled && <CodeForm agent_id={agent_id} files={code_files} />}
                {artifactsEnabled && <Artifacts />}
                {availableMCPServers != null && availableMCPServers.length > 0 && (
                  <MCPTools
                    agentId={agent_id}
                    mcpServerNames={mcpServerNames}
                    setShowMCPToolDialog={setShowMCPToolDialog}
                  />
                )}
                {showSkills && (
                  <div className="mb-4">
                    <div className="mb-2 flex items-center justify-between">
                      <label
                        htmlFor="skills_enabled"
                        className="text-token-text-primary block text-sm font-medium"
                      >
                        {localize('com_ui_skills')}
                      </label>
                      <Controller
                        name="skills_enabled"
                        control={control}
                        render={({ field }) => (
                          <Switch
                            id="skills_enabled"
                            checked={field.value === true}
                            onCheckedChange={(value: boolean) => field.onChange(Boolean(value))}
                            data-testid="skills_enabled"
                            aria-label={localize('com_ui_skills_enable_toggle')}
                          />
                        )}
                      />
                    </div>
                    <p className="mb-2 text-xs text-text-secondary">
                      {localize(skillsHintKey)}
                    </p>
                    <div
                      className={
                        skillsActive === true ? undefined : 'pointer-events-none opacity-50'
                      }
                      aria-disabled={skillsActive !== true}
                    >
                      <div className="mb-1">
                        {(skills ?? []).map((skillId) => {
                          const skillName = skillsMap.get(skillId);
                          if (!skillName) {
                            return null;
                          }
                          return (
                            <div
                              key={skillId}
                              className="mb-1 flex items-center justify-between rounded-md border border-border-light px-3 py-2 text-sm"
                            >
                              <span className="truncate text-text-primary">{skillName}</span>
                              <button
                                type="button"
                                onClick={() => {
                                  const current: string[] = methods.getValues('skills') ?? [];
                                  methods.setValue(
                                    'skills',
                                    current.filter((id) => id !== skillId),
                                    { shouldDirty: true },
                                  );
                                }}
                                className="ml-2 flex-shrink-0 text-text-secondary transition-colors hover:text-text-primary"
                                aria-label={localize('com_ui_remove_skill_var', { 0: skillName })}
                                disabled={skillsActive !== true}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                      <div className="mt-2">
                        <button
                          type="button"
                          onClick={() => setShowSkillDialog(true)}
                          className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                          aria-haspopup="dialog"
                          disabled={skillsActive !== true}
                        >
                          <div className="flex w-full items-center justify-center gap-2">
                            {localize('com_ui_add_skills')}
                          </div>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
                {/* Agent Tools & Actions */}
                <div className="mb-4">
                  <label className={labelClass}>
                    {(() => {
                      if (toolsEnabled === true && actionsEnabled === true) {
                        return localize('com_ui_tools_and_actions');
                      }
                      if (toolsEnabled === true) {
                        return localize('com_ui_tools');
                      }
                      if (actionsEnabled === true) {
                        return localize('com_assistants_actions');
                      }
                      return '';
                    })()}
                  </label>
                  <div>
                    <div className="mb-1">
                      {toolIds.map((toolId, i) => {
                        const tool = regularTools?.find((t) => t.pluginKey === toolId);
                        if (!tool) return null;
                        return (
                          <AgentTool
                            key={`${toolId}-${i}-${agent_id}`}
                            tool={toolId}
                            regularTools={regularTools}
                            agent_id={agent_id}
                          />
                        );
                      })}
                    </div>
                    <div className="flex flex-col gap-1">
                      {(actions ?? [])
                        .filter((action) => action.agent_id === agent_id)
                        .map((action, i) => (
                          <Action
                            key={i}
                            action={action}
                            onClick={() => {
                              setAction(action);
                              setActivePanel(Panel.actions);
                            }}
                          />
                        ))}
                    </div>
                    <div className="mt-2 flex space-x-2">
                      {(toolsEnabled ?? false) && (
                        <button
                          type="button"
                          onClick={() => setShowToolDialog(true)}
                          className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                          aria-haspopup="dialog"
                        >
                          <div className="flex w-full items-center justify-center gap-2">
                            {localize('com_assistants_add_tools')}
                          </div>
                        </button>
                      )}
                      {(actionsEnabled ?? false) && (
                        <button
                          type="button"
                          disabled={isEphemeralAgent(agent_id)}
                          onClick={handleAddActions}
                          className="btn btn-neutral border-token-border-light relative h-9 w-full rounded-lg font-medium"
                          aria-haspopup="dialog"
                        >
                          <div className="flex w-full items-center justify-center gap-2">
                            {localize('com_assistants_add_actions')}
                          </div>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                {/* Séparateur visuel : capacités techniques ↑ / contact + admin ↓ */}
                <div className="mt-2 border-t border-border-light pt-4">
                  {/* Support Contact (Optional) */}
                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span>
                        <label className="text-token-text-primary block text-sm font-medium">
                          {localize('com_ui_support_contact')}
                        </label>
                      </span>
                    </div>
                    <div className="space-y-3">
                      <div className="flex flex-col">
                        <label
                          className="mb-1 flex items-center justify-between"
                          htmlFor="support-contact-name"
                        >
                          <span className="text-sm">
                            {localize('com_ui_support_contact_name')}
                          </span>
                        </label>
                        <Controller
                          name="support_contact.name"
                          control={control}
                          rules={{
                            minLength: {
                              value: 3,
                              message: localize('com_ui_support_contact_name_min_length', {
                                minLength: 3,
                              }),
                            },
                          }}
                          render={({ field, fieldState: { error } }) => (
                            <>
                              <input
                                {...field}
                                value={field.value ?? ''}
                                className={cn(inputClass, error ? 'border-2 border-red-500' : '')}
                                id="support-contact-name"
                                type="text"
                                placeholder={localize('com_ui_support_contact_name_placeholder')}
                                aria-label={localize('com_ui_support_contact_name')}
                                aria-invalid={error ? 'true' : 'false'}
                                aria-describedby={
                                  error ? 'support-contact-name-error' : undefined
                                }
                              />
                              {error && (
                                <span
                                  id="support-contact-name-error"
                                  className="text-sm text-red-500 transition duration-300 ease-in-out"
                                  role="alert"
                                  aria-live="polite"
                                >
                                  {error.message}
                                </span>
                              )}
                            </>
                          )}
                        />
                      </div>
                      <div className="flex flex-col">
                        <label
                          className="mb-1 flex items-center justify-between"
                          htmlFor="support-contact-email"
                        >
                          <span className="text-sm">
                            {localize('com_ui_support_contact_email')}
                          </span>
                        </label>
                        <Controller
                          name="support_contact.email"
                          control={control}
                          rules={{
                            validate: (value) =>
                              validateEmail(
                                value ?? '',
                                localize('com_ui_support_contact_email_invalid'),
                              ),
                          }}
                          render={({ field, fieldState: { error } }) => (
                            <>
                              <input
                                {...field}
                                value={field.value ?? ''}
                                className={cn(inputClass, error ? 'border-2 border-red-500' : '')}
                                id="support-contact-email"
                                type="email"
                                placeholder={localize('com_ui_support_contact_email_placeholder')}
                                aria-label={localize('com_ui_support_contact_email')}
                                aria-invalid={error ? 'true' : 'false'}
                                aria-describedby={
                                  error ? 'support-contact-email-error' : undefined
                                }
                              />
                              {error && (
                                <span
                                  id="support-contact-email-error"
                                  className="text-sm text-red-500 transition duration-300 ease-in-out"
                                  role="alert"
                                  aria-live="polite"
                                >
                                  {error.message}
                                </span>
                              )}
                            </>
                          )}
                        />
                      </div>
                    </div>
                  </div>
                  {/* Admin Settings — admin role only */}
                  {user?.role === SystemRoles.ADMIN && <AdminSettings />}
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
      <ToolSelectDialog
        isOpen={showToolDialog}
        setIsOpen={setShowToolDialog}
        endpoint={EModelEndpoint.agents}
      />
      {availableMCPServers != null && availableMCPServers.length > 0 && (
        <MCPToolSelectDialog
          agentId={agent_id}
          isOpen={showMCPToolDialog}
          mcpServerNames={mcpServerNames}
          setIsOpen={setShowMCPToolDialog}
          endpoint={EModelEndpoint.agents}
        />
      )}
      {showSkills && <SkillSelectDialog isOpen={showSkillDialog} setIsOpen={setShowSkillDialog} />}
    </>
  );
}
