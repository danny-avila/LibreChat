import debounce from 'lodash/debounce';
import { useState, useEffect } from 'react';
import { validateAndParseOpenAPISpec, openapiToFunction } from 'librechat-data-provider';
import type { ValidationResult } from 'librechat-data-provider';
import type { Spec } from './ActionsTable';
import { ActionsTable, columns } from './ActionsTable';
import { cn, removeFocusOutlines } from '~/utils';

const debouncedValidation = debounce(
  (input: string, callback: (result: ValidationResult) => void) => {
    const result = validateAndParseOpenAPISpec(input);
    callback(result);
  },
  800,
);

export default function ActionsInput() {
  const [data, setData] = useState<Spec[] | null>(null);
  const [inputValue, setInputValue] = useState('');
  const [validationResult, setValidationResult] = useState<null | ValidationResult>(null);

  useEffect(() => {
    if (!validationResult || !validationResult.status || !validationResult.spec) {
      return;
    }

    const { requestBuilders } = openapiToFunction(validationResult.spec);
    const specs = Object.entries(requestBuilders).map(([name, props]) => {
      return {
        name,
        method: props.method,
        path: props.path,
      };
    });
    setData(specs);
    setValidationResult(null);
  }, [validationResult]);

  const handleResult = (result: ValidationResult) => {
    setValidationResult(result);
  };

  const handleInputChange = (event) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    if (!newValue) {
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
            <select className="border-token-border-medium h-8 min-w-[100px] rounded-lg border bg-transparent px-2 py-0 text-sm">
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
    </>
  );
}
