import debounce from 'lodash/debounce';
import { useState, useEffect } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  validateAndParseOpenAPISpec,
  openapiToFunction,
  AuthTypeEnum,
} from 'librechat-data-provider';
import type {
  ValidationResult,
  Action,
  FunctionTool,
  ActionMetadata,
} from 'librechat-data-provider';
import type { ActionAuthForm } from '~/common';
import type { Spec } from './ActionsTable';
import { useAssistantsMapContext, useToastContext } from '~/Providers';
import { ActionsTable, columns } from './ActionsTable';
import { useUpdateAction } from '~/data-provider';
import { cn, removeFocusOutlines } from '~/utils';
import useLocalize from '~/hooks/useLocalize';
import { Spinner } from '~/components/svg';

const debouncedValidation = debounce(
  (input: string, callback: (result: ValidationResult) => void) => {
    const result = validateAndParseOpenAPISpec(input);
    callback(result);
  },
  800,
);

export default function ActionsInput({
  action,
  assistant_id,
  setAction,
}: {
  action?: Action;
  assistant_id?: string;
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
  const assistantMap = useAssistantsMapContext();
  const { handleSubmit, reset } = useFormContext<ActionAuthForm>();
  const [validationResult, setValidationResult] = useState<null | ValidationResult>(null);
  const [inputValue, setInputValue] = useState('');

  const [data, setData] = useState<Spec[] | null>(null);
  const [functions, setFunctions] = useState<FunctionTool[] | null>(null);

  useEffect(() => {
    if (!action?.metadata?.raw_spec) {
      return;
    }
    setInputValue(action.metadata.raw_spec);
    debouncedValidation(action.metadata.raw_spec, handleResult);
  }, [action?.metadata?.raw_spec]);

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

  const updateAction = useUpdateAction({
    onSuccess(data) {
      showToast({
        message: localize('com_assistants_update_actions_success'),
        status: 'success',
      });
      reset();
      setAction(data[2]);
    },
    onError(error) {
      showToast({
        message: (error as Error)?.message ?? localize('com_assistants_update_actions_error'),
        status: 'error',
      });
    },
  });

  const saveAction = handleSubmit((authFormData) => {
    console.log('authFormData', authFormData);
    if (!assistant_id) {
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
    const domain = parsedUrl.hostname;
    if (!domain) {
      // alert user?
      return;
    }
    metadata.domain = domain;

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

    updateAction.mutate({
      action_id,
      metadata,
      functions,
      assistant_id,
      model: assistantMap[assistant_id].model,
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

  return (
    <>
      <div className="">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-4">
          <label className="text-token-text-primary whitespace-nowrap font-medium">Schema</label>
          <div className="flex items-center gap-2">
            {/* <button className="btn btn-neutral border-token-border-light relative h-8 min-w-[100px] rounded-lg font-medium">
              <div className="flex w-full items-center justify-center text-xs">Import from URL</div>
            </button> */}
            <select
              onChange={(e) => console.log(e.target.value)}
              className="border-token-border-medium h-8 min-w-[100px] rounded-lg border bg-transparent px-2 py-0 text-sm"
            >
              <option value="label">{localize('com_ui_examples')}</option>
              {/* TODO: make these appear and function correctly */}
              <option value="0">Weather (JSON)</option>
              <option value="1">Pet Store (YAML)</option>
              <option value="2">Blank Template</option>
            </select>
          </div>
        </div>
        <div className="border-token-border-light mb-4 overflow-hidden rounded-lg border">
          <div className="relative">
            <textarea
              value={inputValue}
              onChange={handleInputChange}
              spellCheck="false"
              placeholder="Enter your OpenAPI schema here"
              className={cn(
                'text-token-text-primary block h-96 w-full border-none bg-transparent p-2 font-mono text-xs',
                removeFocusOutlines,
              )}
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
        <div>
          <div className="mb-1.5 flex items-center">
            <label className="text-token-text-primary block font-medium">
              {localize('com_assistants_available_actions')}
            </label>
          </div>
          <ActionsTable columns={columns} data={data} />
        </div>
      )}
      <div className="mt-4">
        <div className="mb-1.5 flex items-center">
          <span className="" data-state="closed">
            <label className="text-token-text-primary block font-medium">
              {localize('com_ui_privacy_policy')}
            </label>
          </span>
        </div>
        <div className="rounded-md border border-gray-300 px-3 py-2 shadow-none focus-within:border-gray-800 focus-within:ring-1 focus-within:ring-gray-800 dark:border-gray-700 dark:bg-gray-700 dark:focus-within:border-gray-500 dark:focus-within:ring-gray-500">
          <label
            htmlFor="privacyPolicyUrl"
            className="block text-xs font-medium text-gray-900 dark:text-gray-100"
          />
          <div className="relative">
            <input
              name="privacyPolicyUrl"
              id="privacyPolicyUrl"
              className="block w-full border-0 p-0 text-gray-900 placeholder-gray-500 shadow-none outline-none focus-within:shadow-none focus-within:outline-none focus-within:ring-0 focus:border-none focus:ring-0 dark:bg-gray-700 dark:text-gray-100 sm:text-sm"
              placeholder="https://api.example-weather-app.com/privacy"
              // value=""
            />
          </div>
        </div>
      </div>
      <div className="flex items-center justify-end">
        <button
          disabled={!functions || !functions.length}
          onClick={saveAction}
          className="focus:shadow-outline mt-1 flex min-w-[100px] items-center justify-center rounded bg-green-500 px-4 py-2 font-semibold text-white hover:bg-green-400 focus:border-green-500 focus:outline-none focus:ring-0 disabled:bg-green-400"
          type="button"
        >
          {updateAction.isLoading ? (
            <Spinner className="icon-md" />
          ) : action?.action_id ? (
            localize('com_ui_update')
          ) : (
            localize('com_ui_create')
          )}
        </button>
      </div>
    </>
  );
}
