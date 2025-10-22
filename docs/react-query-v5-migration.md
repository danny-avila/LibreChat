## React Query v5 Migration: Mutation Types and Callbacks

Purpose: Track and execute the migration to TanStack Query v5 for mutation typings and callback signatures while retaining explicit `UseMutationResult` on public surfaces.

### References
- TanStack Query v5 migration guide: [Migrating to v5 → new hooks for suspense](https://tanstack.com/query/latest/docs/framework/react/guides/migrating-to-v5#new-hooks-for-suspense)

### Goals
- Use TanStack types directly: `UseMutationResult` and `UseMutationOptions`.
- Enforce v5 callback arg order: `(data, variables, onMutateResult, context)`.
- Remove any `...args` callback forwarding.
- Ensure generics are ordered correctly: `<Data, Error, Variables, OnMutateResult>`.
- Keep return type annotations only on public surfaces; rely on inference elsewhere.

### Checklist
- [ ] Replace custom mutation option/result aliases with TanStack types where exposed publicly.
- [ ] Standardize generic order for all `UseMutationResult` usages.
- [ ] Standardize options params to `UseMutationOptions<Data, Error, Variables, OnMutateResult>`.
- [ ] Replace `onSuccess: (...args)` with `onSuccess: (data, variables, onMutateResult, context)`.
- [ ] Replace `onError: (...args)` with `onError: (error, variables, onMutateResult, context)`.
- [ ] Replace `onSettled: (...args)` with `onSettled: (data, error, variables, context)`.
- [ ] Ensure `onMutate` returns the intended `OnMutateResult` type when used.
- [ ] Internal and external callbacks must share v5 signatures. When overriding hook callbacks (e.g., cache updates in `onSuccess`), forward all four args to user-provided callbacks: `(data, variables, onMutateResult, context)`.
- [ ] Avoid wrapper lambdas that change callback types. Prefer `onMutate: options?.onMutate` instead of `(vars) => options?.onMutate?.(vars)` so the return type (`OnMutateResult`) is preserved.
- [ ] Prefer inferred return types for internal hooks; keep explicit `UseMutationResult` where exported.
- [ ] (Optional) Normalize query error typing (`UseQueryResult<TData>` or specify `Error`).

### Known callback arg order (v5)
- onMutate: `(variables) => onMutateResult | Promise<onMutateResult>`
- onSuccess: `(data, variables, onMutateResult, context)`
- onError: `(error, variables, onMutateResult, context)`
- onSettled: `(data, error, variables, context)`

### Inventory: UseMutationResult occurrences (by file)

packages/data-provider/src/react-query/react-query-service.ts
- Lines: 69, 84, 98, 110, 127, 139, 174, 225, 242, 259, 278, 314, 325, 351, 372, 395, 428, 490

client/src/data-provider/roles.ts
- Lines: 34, 70, 106, 142, 178

client/src/data-provider/mutations.ts
- Lines: 21, 49, 69, 87, 172, 200, 224, 309, 455, 481, 561, 605, 675, 690, 706, 722, 738, 760, 796, 868, 909, 929, 991, 1054, 1066, 1076

client/src/data-provider/Tools/mutations.ts
- Lines: 9

client/src/data-provider/Files/mutations.ts
- Lines: 18, 144

client/src/data-provider/Auth/mutations.ts
- Lines: 13, 35, 59, 75, 94, 109, 124, 139, 154, 171

client/src/data-provider/Agents/mutations.ts
- Lines: 18, 51, 105, 153, 190, 208, 278, 344

client/src/data-provider/prompts.ts
- Lines: 19, 102, 144, 175, 229, 267

client/src/data-provider/Messages/mutations.ts
- Lines: 8

client/src/data-provider/Files/sharepoint.ts
- Lines: 30, 105

client/src/components/SidePanel/Builder/ContextButton.tsx
- Lines: 26

client/src/components/SidePanel/Builder/AssistantSelect.tsx
- Lines: 60

client/src/components/SidePanel/Builder/AssistantAvatar.tsx
- Lines: 37

client/src/components/SidePanel/Agents/__tests__/AgentFooter.spec.tsx
- Lines: 87

client/src/components/SidePanel/Agents/DeleteButton.tsx
- Lines: 26

client/src/components/SidePanel/Agents/AgentSelect.tsx
- Lines: 24

client/src/components/SidePanel/Agents/AgentAvatar.tsx
- Lines: 34

client/src/common/types.ts
- Lines: 214, 435

### Inventory: UseMutationOptions occurrences (by file)

client/src/data-provider/Memories/queries.ts
- Lines: 38, 61, 87

### Inventory: spread-args callback forwarding to change
- packages/data-provider/src/react-query/react-query-service.ts: 283, 357
- client/src/data-provider/mutations.ts: 380
- client/src/data-provider/Auth/mutations.ts: 23, 50, 84

### Implementation guidance
1) For each file above:
   - Confirm `UseMutationResult` generic order: `<Data, Error, Variables, OnMutateResult>`.
   - If `Error` should be `Error` (not `unknown`), set it explicitly in both result and options.
   - Replace any `(...args)` in `onSuccess/onError/onSettled` with explicit parameter lists.
   - Ensure any `onMutate` returns the appropriate `OnMutateResult` type if later used.
2) Prefer omitting explicit return types on internal hooks; keep them for exported/public APIs.
3) Run typecheck/build, resolve residual errors.

### Notes
- Keep changes minimal: favor type alias replacements and callback parameter fixes over larger refactors.
- After mutation cleanup, evaluate query typings (separately) to address `unknown` vs `Error` mismatches.


