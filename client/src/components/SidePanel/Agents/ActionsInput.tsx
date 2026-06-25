import { useState, useEffect } from 'react';
import debounce from 'lodash/debounce';
import { Maximize2 } from 'lucide-react';
import { useFormContext } from 'react-hook-form';
import {
  Button,
  Spinner,
  Textarea,
  Skeleton,
  OGDialog,
  OGDialogClose,
  OGDialogTitle,
  OGDialogHeader,
  OGDialogContent,
  OGDialogDescription,
  useToastContext,
} from '@librechat/client';
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

/** Placeholder rows shaped like the "Available actions" table (Name / Method / Path). */
function ActionsTableSkeleton() {
  return (
    <div className="flex flex-col gap-2 pt-1" aria-busy="true" aria-live="polite">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border-light pb-2.5 pt-1">
          <Skeleton className="h-3.5 w-1/3" />
          <Skeleton className="h-3.5 w-12" />
          <Skeleton className="h-3.5 flex-1" />
        </div>
      ))}
    </div>
  );
}

export default function ActionsInput({
  action,
  agent_id,
  setAction,
  onCreated,
  footerStart,
}: {
  action?: Action;
  agent_id?: string;
  setAction: React.Dispatch<React.SetStateAction<Action | undefined>>;
  onCreated?: () => void;
  footerStart?: React.ReactNode;
}) {
  const handleResult = (result: ValidationResult) => {
    if (!result.status) {
      setData(null);
      setFunctions(null);
      setIsValidating(false);
    }
    setValidationResult(result);
  };

  const localize = useLocalize();
  const { showToast } = useToastContext();
  const { handleSubmit, reset } = useFormContext<ActionAuthForm>();
  const [validationResult, setValidationResult] = useState<null | ValidationResult>(null);
  const [inputValue, setInputValue] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSchemaDialogOpen, setIsSchemaDialogOpen] = useState(false);

  const [data, setData] = useState<Spec[] | null>(null);
  const [functions, setFunctions] = useState<FunctionTool[] | null>(null);

  useEffect(() => {
    const rawSpec = action?.metadata.raw_spec ?? '';
    if (!rawSpec) {
      return;
    }
    setInputValue(rawSpec);
    setIsValidating(true);
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
    setIsValidating(false);
  }, [validationResult]);

  const updateAgentAction = useUpdateAgentAction({
    onSuccess(data) {
      const wasCreate = !action?.action_id;
      showToast({
        message: localize('com_assistants_update_actions_success'),
        status: 'success',
      });
      reset();
      setAction(data[1]);
      if (wasCreate) {
        onCreated?.();
      }
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
      setIsValidating(false);
      return setValidationResult(null);
    }
    setIsValidating(true);
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

  const validationError =
    validationResult && validationResult.message !== 'OpenAPI spec is valid.'
      ? validationResult.message
      : null;
  const showSkeleton = isValidating && !data;

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <label
            htmlFor="schemaInput"
            className="whitespace-nowrap text-sm font-medium text-text-primary"
          >
            {localize('com_ui_schema')}
          </label>
          <button
            type="button"
            onClick={() => setIsSchemaDialogOpen(true)}
            aria-label={localize('com_ui_expand_editor')}
            title={localize('com_ui_expand_editor')}
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-secondary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring-primary"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.75} aria-hidden={true} />
          </button>
        </div>
        <div className="mb-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border-medium ring-0 hover:border-border-heavy">
          <div className="relative flex min-h-0 flex-1 flex-col">
            <Textarea
              id="schemaInput"
              value={inputValue}
              onChange={handleInputChange}
              spellCheck="false"
              placeholder={localize('com_ui_enter_openapi_schema')}
              className="min-h-[12rem] flex-1 resize-y rounded-none border-0 bg-transparent p-2 font-mono text-xs focus-visible:ring-0"
            />
          </div>
          {validationError && (
            <div className="border-t border-border-light p-2 text-red-500">
              {validationError.split('\n').map((line: string, i: number) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
        </div>
      </div>
      {(data || showSkeleton) && (
        <div className="my-2">
          <div className="flex items-center">
            <label className="block text-sm font-medium text-text-primary">
              {localize('com_assistants_available_actions')}
            </label>
          </div>
          {data ? <ActionsTable columns={columns} data={data} /> : <ActionsTableSkeleton />}
        </div>
      )}
      <div className="relative my-1">
        <ActionCallback action_id={action?.action_id} />
      </div>
      <div className="mt-auto flex items-center justify-between gap-2 pt-2">
        <div className="flex items-center">{footerStart}</div>
        <Button
          type="button"
          variant="submit"
          onClick={saveAction}
          disabled={!functions || !functions.length}
          className="min-w-[100px]"
        >
          {getButtonContent()}
        </Button>
      </div>

      <OGDialog open={isSchemaDialogOpen} onOpenChange={setIsSchemaDialogOpen}>
        <OGDialogContent
          className="flex h-[85vh] max-h-[85vh] w-11/12 max-w-5xl flex-col gap-4 p-6"
          showCloseButton={false}
        >
          <OGDialogHeader className="mb-2 pr-14">
            <OGDialogTitle className="text-left text-2xl font-semibold">
              {localize('com_ui_schema')}
            </OGDialogTitle>
            <OGDialogDescription className="sr-only">
              {localize('com_ui_enter_openapi_schema')}
            </OGDialogDescription>
          </OGDialogHeader>
          <Textarea
            value={inputValue}
            onChange={handleInputChange}
            spellCheck="false"
            placeholder={localize('com_ui_enter_openapi_schema')}
            aria-label={localize('com_ui_schema')}
            className="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed"
          />
          {validationError && (
            <div className="max-h-24 overflow-y-auto text-sm text-red-500">
              {validationError.split('\n').map((line: string, i: number) => (
                <div key={i}>{line}</div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end">
            <OGDialogClose asChild>
              <Button>{localize('com_ui_done')}</Button>
            </OGDialogClose>
          </div>
        </OGDialogContent>
      </OGDialog>
    </>
  );
}
