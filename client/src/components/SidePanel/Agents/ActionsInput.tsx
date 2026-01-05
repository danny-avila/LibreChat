import { useState, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { useFormContext } from 'react-hook-form';
import { Spinner, useToastContext } from '@librechat/client';
import {
  validateAndParseOpenAPISpec,
  openapiToFunction,
  AuthTypeEnum,
} from 'librechat-data-provider';
import type {
  Action,
  FunctionTool,
  ActionMetadata,
  ValidationResult,
} from 'librechat-data-provider';
import type { ActionAuthForm } from '~/common';
import type { Spec } from './ActionsTable';
import ActionCallback from '~/components/SidePanel/Builder/ActionCallback';
import { ActionsTable, columns } from './ActionsTable';
import { useUpdateAgentAction } from '~/data-provider';
import { useLocalize } from '~/hooks';
import { logger } from '~/utils';

const debouncedValidation = debounce(
  (input: string, callback: (result: ValidationResult) => void) => {
    const result = validateAndParseOpenAPISpec(input);
    callback(result);
  },
  800,
);

export default function ActionsInput({
  action,
  agent_id,
  setAction,
}: {
  action?: Action;
  agent_id?: string;
  setAction: React.Dispatch<React.SetStateAction<Action | undefined>>;
}) {
  const handleResult = (result: ValidationResult) => {
    if (!result.status) {
      setData(null);
      setFunctions(null);
    }
    setValidationResult(result);
  };

  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { handleSubmit, reset } = useFormContext<ActionAuthForm>();
  const [validationResult, setValidationResult] = useState<null | ValidationResult>(null);
  const [inputValue, setInputValue] = useState('');

  const [data, setData] = useState<Spec[] | null>(null);
  const [functions, setFunctions] = useState<FunctionTool[] | null>(null);

  useEffect(() => {
    const rawSpec = action?.metadata.raw_spec ?? '';
    if (!rawSpec) {
      return;
    }
    setInputValue(rawSpec);
    debouncedValidation(rawSpec, handleResult);
  }, [action?.metadata.raw_spec]);

  useEffect(() => {
    if (!validationResult || !validationResult.status || !validationResult.spec) {
      return;
    }

    const { functionSignatures, requestBuilders } = openapiToFunction(validationResult.spec);
    const specs = Object.entries(requestBuilders).map(([name, props]) => {
      return {
        name,
        method: props.method,
        path: props.path,
        domain: props.domain,
      };
    });

    setData(specs);
    setValidationResult(null);
    setFunctions(functionSignatures.map((f) => f.toObjectTool()));
  }, [validationResult]);

  const updateAgentAction = useUpdateAgentAction({
    onSuccess(data) {
      showToast({
        message: localize('com_assistants_update_actions_success'),
        status: 'success',
      });
      reset();
      setAction(data[1]);
    },
    onError(error) {
      showToast({
        message: (error as Error).message || localize('com_assistants_update_actions_error'),
        status: 'error',
      });
    },
  });

  const saveAction = handleSubmit((authFormData) => {
    logger.log('actions', 'saving action', authFormData);
    const currentAgentId = agent_id ?? '';
    if (!currentAgentId) {
      // alert user?
      return;
    }

    if (!functions) {
      return;
    }

    if (!data) {
      return;
    }

    let { metadata = {} } = action ?? {};
    const action_id = action?.action_id;
    metadata.raw_spec = inputValue;
    const parsedUrl = new URL(data[0].domain);
    if (!parsedUrl.hostname) {
      // alert user?
      return;
    }
    // Send protocol + hostname for proper SSRF validation (e.g., "http://192.168.1.1")
    metadata.domain = `${parsedUrl.protocol}//${parsedUrl.hostname}`;

    const { type, saved_auth_fields } = authFormData;

    const removeSensitiveFields = (obj: ActionMetadata) => {
      delete obj.auth;
      delete obj.api_key;
      delete obj.oauth_client_id;
      delete obj.oauth_client_secret;
    };

    if (saved_auth_fields && type === AuthTypeEnum.ServiceHttp) {
      metadata = {
        ...metadata,
        api_key: authFormData.api_key,
        auth: {
          type,
          authorization_type: authFormData.authorization_type,
          custom_auth_header: authFormData.custom_auth_header,
        },
      };
    } else if (saved_auth_fields && type === AuthTypeEnum.OAuth) {
      metadata = {
        ...metadata,
        auth: {
          type,
          authorization_url: authFormData.authorization_url,
          client_url: authFormData.client_url,
          scope: authFormData.scope,
          token_exchange_method: authFormData.token_exchange_method,
        },
        oauth_client_id: authFormData.oauth_client_id,
        oauth_client_secret: authFormData.oauth_client_secret,
      };
    } else if (saved_auth_fields) {
      removeSensitiveFields(metadata);
      metadata.auth = {
        type,
      };
    } else {
      removeSensitiveFields(metadata);
    }

    updateAgentAction.mutate({
      action_id,
      metadata,
      functions,
      agent_id: currentAgentId,
    });
  });

  const handleInputChange: React.ChangeEventHandler<HTMLTextAreaElement> = (event) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    if (!newValue) {
      setData(null);
      setFunctions(null);
      return setValidationResult(null);
    }
    debouncedValidation(newValue, handleResult);
  };

  const getButtonContent = () => {
    if (updateAgentAction.isLoading) {
      return <Spinner className="icon-md" />;
    }

    if (action?.action_id != null && action.action_id) {
      return localize('com_ui_update');
    }

    return localize('com_ui_create');
  };

  return (
    <>
      <div className="">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-4">
          <label
            htmlFor="schemaInput"
            className="text-token-text-primary whitespace-nowrap font-medium"
          >
            {localize('com_ui_schema')}
          </label>
          {/* TODO: Implement examples functionality
          <div className="flex items-center gap-2">
            <select
              onChange={(e) => logger.log('actions', 'selecting example action', e.target.value)}
              className="border-token-border-medium h-8 min-w-[100px] rounded-lg border bg-transparent px-2 py-0 text-sm"
            >
              <option value="label">{localize('com_ui_examples')}</option>
              <option value="0">Weather (JSON)</option>
              <option value="1">Pet Store (YAML)</option>
              <option value="2">Blank Template</option>
            </select>
          </div>
          */}
        </div>
        <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover mb-4 w-full overflow-hidden rounded-lg border ring-0">
          <div className="relative">
            <textarea
              id="schemaInput"
              value={inputValue}
              onChange={handleInputChange}
              spellCheck="false"
              placeholder={localize('com_ui_enter_openapi_schema')}
              className="text-token-text-primary block h-96 w-full bg-transparent p-2 font-mono text-xs outline-none focus:ring-1 focus:ring-border-light"
            />
            {/* TODO: format input button */}
          </div>
          {validationResult && validationResult.message !== 'OpenAPI spec is valid.' && (
            <div className="border-token-border-light border-t p-2 text-red-500">
              {validationResult.message.split('\n').map((line: string, i: number) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      {!!data && (
        <div className="my-2">
          <div className="flex items-center">
            <label className="text-token-text-primary block font-medium">
              {localize('com_assistants_available_actions')}
            </label>
          </div>
          <ActionsTable columns={columns} data={data} />
        </div>
      )}
      <div className="relative my-1">
        <ActionCallback action_id={action?.action_id} />
        <div className="mb-1.5 flex items-center">
          <label className="text-token-text-primary block font-medium">
            {localize('com_ui_privacy_policy_url')}
          </label>
        </div>
        <div className="border-token-border-medium bg-token-surface-primary hover:border-token-border-hover flex h-9 w-full rounded-lg border">
          <input
            type="text"
            placeholder="https://api.example-weather-app.com/privacy"
            className="flex-1 rounded-lg bg-transparent px-3 py-1.5 text-sm outline-none placeholder:text-text-secondary-alt focus:ring-1 focus:ring-border-light"
          />
        </div>
      </div>
      <div className="flex items-center justify-end">
        <button
          disabled={!functions || !functions.length}
          onClick={saveAction}
          className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0 disabled:bg-green-400"
          type="button"
        >
          {getButtonContent()}
        </button>
      </div>
    </>
  );
}
