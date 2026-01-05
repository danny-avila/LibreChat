# Swagger/OpenAPI for Side Panel Actions

The Builder and Agent side panels accept a Swagger (OpenAPI 3) definition so the UI can turn every exported endpoint into a callable action. Rather than re-implement every HTTP form, the components reuse `validateAndParseOpenAPISpec` and `openapiToFunction` from `librechat-data-provider` to turn a single schema into:

- a list of table rows describing each path/method/domain (used by the `ActionsTable`).
- a bundle of `FunctionTool` helpers that the assistant/agent can call once the action is saved.

The entire flow lives inside the `ActionsInput` components for builders and agents, so any Swagger URL you provide ultimately lands in those files before it ever touches the backend UI state.

## Loading a Swagger URL

1. Host your OpenAPI spec somewhere the browser can reach, e.g. `https://petstore.swagger.io/v2/swagger.json` for proof of concept or `https://api.myservice.local/openapi.json` for your own API.
2. Fetch the JSON/YAML payload and paste it into the `Schema` textarea shown in the Builder/Agent side panels.
3. The textarea is throttled with an 800 ms debounce; once a valid spec arrives, the component calls `validateAndParseOpenAPISpec` to make sure the document is structurally sound and `openapiToFunction` to derive functions for the helper network. The parsing and validation live inside the builder form at [client/src/components/SidePanel/Builder/ActionsInput.tsx](client/src/components/SidePanel/Builder/ActionsInput.tsx#L1-L211) and inside the agent form at [client/src/components/SidePanel/Agents/ActionsInput.tsx](client/src/components/SidePanel/Agents/ActionsInput.tsx#L1-L201).
4. After parsing succeeds, the UI fills the `ActionsTable` and enables the Save button; the table columns are defined in [client/src/components/SidePanel/Builder/ActionsTable/Columns.tsx](client/src/components/SidePanel/Builder/ActionsTable/Columns.tsx#L1-L32) (same definition is reused by the Agents table), so you can confirm the data contains a `name`, `method`, `path`, and `domain` per action.

## Specification requirements

- The payload must be a valid OpenAPI 3 document so the helper’s `ValidationResult` returns `status: true` and `spec` contains the parsed output.
- Each operation must declare a `servers` entry (or allow the helper to infer one) because the UI extracts the hostname from `requestBuilders` to populate `metadata.domain` (see the domain extraction near [client/src/components/SidePanel/Builder/ActionsInput.tsx#L111-L190]).
- Include enough metadata (security schemes, parameters, request/response schemas) so the generated `FunctionTool` bodies are usable for testing or automation once the action is saved.

## Example Swagger URLs you can use right now

- `https://petstore.swagger.io/v2/swagger.json` – a public demo that already matches the fake data we show in the tables.
- `https://raw.githubusercontent.com/OAI/OpenAPI-Specification/main/examples/v3.0/petstore-expanded.json` – a richer sample to test parameter handling.
- Host your own spec from the backend (`/openapi.json`, `/swagger/v1/swagger.json`, etc.) and point the browser at that URL before copying/pasting into the textarea.

## From schema to saved action

Once the textarea validates:

1. The parsed operations populate `data`, which is rendered inside `ActionsTable` (columns include method, path, and domain). The sample data uses `petstore.swagger.io` to prove the shape is correct.
2. The component maps the `functionSignatures` from `openapiToFunction` into `FunctionTool` objects and stores them in `functions`; these are what eventually get saved with the assistant/agent action.
3. When the Save button is pressed, the handler bundles `metadata.raw_spec`, `metadata.domain` (derived from the first action’s `domain`), and the `functions` into the API payload for `useUpdateAction` or `useUpdateAgentAction`. That process is shown at [client/src/components/SidePanel/Builder/ActionsInput.tsx#L111-L190] and [client/src/components/SidePanel/Agents/ActionsInput.tsx#L104-L179].

If the Swagger URL you provide ever moves or requires authentication, you can paste the new spec text directly into the textarea again and re-save the action. For programmatic imports, consider running a quick `curl https://your-service/openapi.json` and feeding the result into the textarea so the UI picks up the same payload every time.
