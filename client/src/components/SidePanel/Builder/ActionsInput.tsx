import debounce from 'lodash/debounce';
import { useState, useEffect } from 'react';
import { validateAndParseOpenAPISpec, openapiToFunction } from 'librechat-data-provider';
import type { ValidationResult, Action, FunctionTool } from 'librechat-data-provider';
import type { Spec } from './ActionsTable';
import { ActionsTable, columns } from './ActionsTable';
import { useUpdateAction } from '~/data-provider';
import { cn, removeFocusOutlines } from '~/utils';
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
}: {
  action?: Action;
  assistant_id?: string;
}) {
  const [inputValue, setInputValue] = useState('');
  const [data, setData] = useState<Spec[] | null>(null);
  const [functions, setFunctions] = useState<FunctionTool[] | null>(null);
  const [validationResult, setValidationResult] = useState<null | ValidationResult>(null);

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

  const updateAction = useUpdateAction();

  const saveAction = () => {
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

    const { action_id, metadata = {} } = action ?? {};
    metadata.raw_spec = inputValue;
    const parsedUrl = new URL(data[0].domain);
    const domain = parsedUrl.hostname;
    if (!domain) {
      // alert user?
      return;
    }
    metadata.domain = domain;
    updateAction.mutate({
      action_id,
      metadata,
      functions,
      assistant_id,
    });
  };

  const handleResult = (result: ValidationResult) => {
    if (!result.status) {
      setData(null);
      setFunctions(null);
    }
    setValidationResult(result);
  };

  const handleInputChange = (event) => {
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
            <button className="btn btn-neutral border-token-border-light relative h-8 min-w-[100px] rounded-lg font-medium">
              <div className="flex w-full items-center justify-center text-xs">Import from URL</div>
            </button>
            <select
              onChange={(e) => console.log(e.target.value)}
              className="border-token-border-medium h-8 min-w-[100px] rounded-lg border bg-transparent px-2 py-0 text-sm"
            >
              <option value="label">Examples</option>
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
      <div>
        <div className="mb-1.5 flex items-center">
          <label className="text-token-text-primary block font-medium">Available actions</label>
        </div>
        {data && <ActionsTable columns={columns} data={data} />}
      </div>
      <div className="mt-4">
        <div className="mb-1.5 flex items-center">
          <span className="" data-state="closed">
            <label className="text-token-text-primary block font-medium">Privacy policy</label>
          </span>
        </div>
        <div className="rounded-md border border-gray-300 px-3 py-2 shadow-none focus-within:border-gray-800 focus-within:ring-1 focus-within:ring-gray-800 dark:bg-gray-700 dark:focus-within:border-white dark:focus-within:ring-white">
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
          {/* TODO: Add localization */}
          {updateAction.isLoading ? (
            <Spinner className="icon-md" />
          ) : action?.action_id ? (
            'Save'
          ) : (
            'Create'
          )}
        </button>
      </div>
    </>
  );
}
