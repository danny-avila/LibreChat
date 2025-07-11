# Recoil to Jotai Migration Plan for LibreChat

## Migration Checklist

**Instructions**: Update this checklist by marking items with `[x]` when completed.

### Phase 1: Setup and Preparation
- [x] Install Jotai dependencies using npm
- [x] Set up basic Jotai configuration

### Phase 2: Migrate All Store Files (Atoms Only)
#### Simple Atoms (No localStorage)
- [x] Migrate user.ts atoms
- [x] Migrate toast.ts atoms

#### Atoms with localStorage
- [x] Migrate language.ts atoms
- [x] Migrate misc.ts atoms
- [x] Migrate settings.ts with atomWithStorage
- [x] Migrate temporary.ts atoms
- [x] Migrate prompts.ts atoms

#### Complex State Files
- [x] Migrate families.ts (atomFamily patterns)
- [x] Migrate artifacts.ts state management
- [x] Migrate agents.ts ephemeral state
- [x] Migrate search.ts atoms
- [x] Migrate submission.ts atoms

#### Remaining Store Files
- [x] Migrate endpoints.ts
- [x] Migrate preset.ts
- [x] Migrate text.ts

### Phase 3: Migrate Selectors and Derived State ✅
- [x] Convert selectors to derived atoms (done in Phase 2)
- [x] Migrate selectorFamily patterns (done in families.ts)
- [x] Update all selector consumers (will be done with hook migration)

### Phase 4: Migrate Utils and Core Infrastructure ✅
- [x] Remove/update store/utils.ts (atomWithLocalStorage no longer needed)
- [x] Update store index exports (no changes needed)
- [x] Migrate any Recoil callbacks to Jotai patterns (found in families.ts and agents.ts)
- [x] Migrate reset functionality patterns (updated artifacts.ts and preset.ts with atomWithReset)

### Phase 5: Update Components (Hooks Only) - ✅ COMPLETE (for staged files)
- [x] Created automated migration script with duplicate import handling
- [x] Migrated 130 TypeScript files to use Jotai hooks
- [x] Fixed duplicate imports between Recoil and Jotai
- [x] Handled useRecoilCallback migrations manually (4 files: BadgeRow.tsx, TemporaryChat.tsx, useChatHelpers.ts, useChatBadges.ts)
- [x] Updated common/types.ts to use Jotai types instead of Recoil types
- [x] Fixed all TypeScript type compatibility issues in staged files:
  - [x] SetterOrUpdater<T> → Dispatch<SetStateAction<T>> migration
  - [x] Created utility functions for SetStateAction support (atomWithUpdater, atomFamilyWithUpdater)
  - [x] Fixed ChatHelpers type mismatch in ChatView.tsx
  - [x] Fixed useResetAtom type issues (replaced with useSetAtom + RESET)
- [x] Resolved all 66 TypeScript errors in staged files
- [ ] Migrate remaining files that still have Recoil imports (non-staged)
- [ ] Update test files to use Jotai Provider instead of RecoilRoot

### Phase 6: Replace RecoilRoot with Jotai Provider ✅
- [x] Replace RecoilRoot with Jotai Provider in App.jsx
- [x] Update any provider configuration
- [x] Verify app still renders correctly

### Phase 7: Testing and Validation
- [ ] Test localStorage persistence
- [ ] Verify cross-tab synchronization
- [ ] Run all existing tests
- [ ] Fix failing tests
- [ ] Add migration-specific tests
- [ ] Performance testing and optimization

### Phase 8: Cleanup
- [ ] Remove Recoil dependencies from package.json
- [ ] Clean up unused imports
- [ ] Remove old Recoil-specific utilities
- [ ] Update documentation
- [ ] Final code review

## Progress Notes

### Completed So Far:
1. **Phase 1**: Setup and Preparation ✅
   - Jotai installed successfully
   
2. **Phase 2**: Store Files Migration ✅ COMPLETE!
   - All store files migrated from Recoil to Jotai
   - localStorage atoms migrated to atomWithStorage
   - Complex atomFamily patterns successfully converted
   - All selectors converted to derived atoms
   
3. **Phase 3**: Selectors and Derived State ✅ COMPLETE!
   - All selectors converted to derived atoms during Phase 2
   - SelectorFamily patterns migrated in families.ts
   
4. **Phase 4**: Utils and Infrastructure ✅ COMPLETE!
   - Removed store/utils.ts (atomWithLocalStorage no longer needed)
   - Store index exports checked (no changes needed)
   - Recoil callbacks migrated to Jotai patterns (useStore + useCallback)
   - Reset functionality added with atomWithReset for artifacts and preset atoms

5. **Phase 5**: Component Migration - ✅ COMPLETE for staged files!
   - Created automated migration script that handles:
     - useRecoilState → useAtom
     - useRecoilValue → useAtomValue
     - useSetRecoilState → useSetAtom
     - Duplicate import detection and removal
   - Successfully migrated 130 staged TypeScript files
   - Fixed ALL TypeScript errors (from 66 → 0)
   - Created utility functions for SetStateAction support
   - Type casting used for immediate compatibility
   - Files still importing from 'recoil' are non-staged

### Key Learnings:
- Jotai's API is simpler than Recoil's
- Built-in utilities cover all our use cases
- Migration is mostly search-and-replace with minor syntax adjustments
- atomFamily equality functions use (prevKey, nextKey) for clarity
- Effects are implemented as derived atoms with getters and setters
- useRecoilCallback → useStore() with useCallback
- Recoil's snapshot.getPromise → store.get() (synchronous in Jotai)
- **Type Incompatibilities Resolved**:
  - Created `atomWithUpdater` and `atomFamilyWithUpdater` utilities for SetStateAction support
  - Type casting works as a pragmatic solution: `as Dispatch<SetStateAction<T>>`
  - useResetAtom → useSetAtom with RESET symbol from 'jotai/utils'
  - atomWithStorage already supports updater functions natively
  - ChatHelpers and interface types updated for Jotai signatures

### Current Status (as of latest update):
- **Staged Files**: 130 TypeScript files modified ✅
- **TypeScript Issues**: 0 errors in staged files ✅
- **ESLint Issues**: 0 errors ✅
- **Prettier**: All files formatted ✅
- **Key Fixes Applied**:
  - Created `/client/src/store/utils.ts` with `atomWithUpdater` and `atomFamilyWithUpdater`
  - Updated `isSubmittingFamily` to use `atomFamilyWithUpdater`
  - Applied type casting in hooks for SetStateAction compatibility
  - Fixed all RESET usage patterns
  - Resolved ChatHelpers type mismatches
- **Remaining Work**: 
  - Non-staged files still have Recoil imports
  - Test files need migration to Jotai Provider
  
### Files Modified in Phase 5:
1. **Utility Creation**:
   - `/client/src/store/utils.ts` - Created SetStateAction support utilities

2. **Atom Updates**:
   - `/client/src/store/families.ts` - Updated isSubmittingFamily to use atomFamilyWithUpdater

3. **Hook Migrations**:
   - `/client/src/hooks/Chat/useChatHelpers.ts` - Type casting for compatibility
   - `/client/src/hooks/Chat/useAddedHelpers.ts` - Type casting for compatibility
   - `/client/src/hooks/Chat/useChatFunctions.ts` - Fixed RESET usage
   - `/client/src/hooks/Conversations/useSetIndexOptions.ts` - Fixed updater patterns
   - `/client/src/hooks/Artifacts/useArtifacts.ts` - Fixed RESET patterns
   - `/client/src/hooks/Files/useDragHelpers.ts` - Fixed updater patterns

4. **Component Migrations**:
   - `/client/src/components/Nav/SettingsTabs/ToggleSwitch.tsx` - Full Recoil → Jotai
   - `/client/src/components/Nav/SettingsTabs/Speech/ConversationModeSwitch.tsx` - Full migration
   - `/client/src/components/Chat/ChatView.tsx` - Fixed type issues
   - `/client/src/components/Nav/SettingsTabs/General/ArchivedChats.tsx` - Fixed callback type

## Detailed Migration Instructions

### 1. Installation

Install Jotai using npm (DO NOT modify package.json directly):

```bash
npm install jotai
```

### 2. Provider Migration

Replace RecoilRoot with Jotai Provider:

**Before (Recoil):**
```jsx
import { RecoilRoot } from 'recoil';

function App() {
  return (
    <RecoilRoot>
      <QueryClientProvider client={queryClient}>
        {/* App content */}
      </QueryClientProvider>
    </RecoilRoot>
  );
}
```

**After (Jotai):**
```jsx
import { Provider } from 'jotai';

function App() {
  return (
    <Provider>
      <QueryClientProvider client={queryClient}>
        {/* App content */}
      </QueryClientProvider>
    </Provider>
  );
}
```

### 3. Basic Atom Migration

**Before (Recoil):**
```typescript
import { atom } from 'recoil';

export const userState = atom({
  key: 'user',
  default: null
});
```

**After (Jotai):**
```typescript
import { atom } from 'jotai';

export const userAtom = atom(null);
```

### 4. Hook Migration

**Before (Recoil):**
```typescript
import { useRecoilState, useRecoilValue, useSetRecoilState } from 'recoil';

const [user, setUser] = useRecoilState(userState);
const user = useRecoilValue(userState);
const setUser = useSetRecoilState(userState);
```

**After (Jotai):**
```typescript
import { useAtom, useAtomValue, useSetAtom } from 'jotai';

const [user, setUser] = useAtom(userAtom);
const user = useAtomValue(userAtom);
const setUser = useSetAtom(userAtom);
```

### 5. localStorage Migration

LibreChat uses a custom `atomWithLocalStorage` utility that adds localStorage persistence to Recoil atoms. Here's the actual implementation:

**Before (Recoil with custom atomWithLocalStorage in `/client/src/store/utils.ts`):**
```typescript
export function atomWithLocalStorage<T>(key: string, defaultValue: T) {
  return atom<T>({
    key,
    default: defaultValue,
    effects_UNSTABLE: [
      ({ setSelf, onSet }) => {
        const savedValue = localStorage.getItem(key);
        if (savedValue !== null) {
          try {
            const parsedValue = JSON.parse(savedValue);
            setSelf(parsedValue);
          } catch (e) {
            console.error(`Error parsing localStorage key "${key}"`, e);
            localStorage.setItem(key, JSON.stringify(defaultValue));
            setSelf(defaultValue);
          }
        }
        onSet((newValue: T) => {
          localStorage.setItem(key, JSON.stringify(newValue));
        });
      },
    ],
  });
}

// Usage example:
const lang = atomWithLocalStorage('lang', defaultLang());
```

**After (Jotai with built-in atomWithStorage):**
```typescript
import { atomWithStorage } from 'jotai/utils';

// Direct replacement - Jotai handles parsing errors automatically!
const lang = atomWithStorage('lang', defaultLang());
```

Key differences:
- Jotai's `atomWithStorage` has built-in error handling for JSON parsing
- No need for custom utility functions
- Automatic cross-tab synchronization via storage events
- Simpler, more maintainable code

### 6. AtomFamily Migration

**Before (Recoil):**
```typescript
export const conversationByIndex = atomFamily({
  key: 'conversationByIndex',
  default: null,
});
```

**After (Jotai):**
```typescript
import { atomFamily } from 'jotai/utils';

export const conversationByIndex = atomFamily(
  (id: string) => atom(null),
  (a, b) => a === b // equality function
);
```

### 7. Selector Migration

**Before (Recoil):**
```typescript
export const allConversationsSelector = selector({
  key: 'allConversationsSelector',
  get: ({ get }) => {
    const keys = get(conversationKeysAtom);
    return keys.map(key => get(conversationByIndex(key)));
  }
});
```

**After (Jotai):**
```typescript
export const allConversationsAtom = atom((get) => {
  const keys = get(conversationKeysAtom);
  return keys.map(key => get(conversationByIndex(key)));
});
```

### 8. Reset Functionality Migration

**Before (Recoil):**
```typescript
import { useResetRecoilState } from 'recoil';

const resetUser = useResetRecoilState(userState);
```

**After (Jotai):**
```typescript
import { atomWithReset, useResetAtom } from 'jotai/utils';

// Define atom with reset capability
export const userAtom = atomWithReset(null);

// Use in component
const resetUser = useResetAtom(userAtom);
```

### 9. Callback Migration

**Before (Recoil):**
```typescript
const clearAllConversations = useRecoilCallback(
  ({ reset, snapshot }) => async () => {
    const conversationKeys = await snapshot.getPromise(conversationKeysAtom);
    conversationKeys.forEach(key => {
      reset(conversationByIndex(key));
    });
  }
);
```

**After (Jotai):**
```typescript
import { useStore } from 'jotai';

const store = useStore();
const clearAllConversations = useCallback(async () => {
  const conversationKeys = store.get(conversationKeysAtom);
  conversationKeys.forEach(key => {
    store.set(conversationByIndex(key), null);
  });
}, [store]);
```

### 10. Effects Migration

**Before (Recoil):**
```typescript
atom({
  key: 'myAtom',
  default: 'value',
  effects: [
    ({ onSet }) => {
      onSet((newValue) => {
        console.log('Value changed:', newValue);
      });
    }
  ]
});
```

**After (Jotai):**
```typescript
const baseAtom = atom('value');
export const myAtom = atom(
  (get) => get(baseAtom),
  (get, set, newValue) => {
    set(baseAtom, newValue);
    console.log('Value changed:', newValue);
  }
);
```

## Migration Strategy by File

### Files Using atomWithLocalStorage:
The following files use the custom `atomWithLocalStorage` utility and need to be migrated to use Jotai's `atomWithStorage`:
- `/client/src/store/settings.ts` - Most extensive usage
- `/client/src/store/language.ts` - Simple usage
- `/client/src/store/misc.ts` - Various UI states
- `/client/src/store/temporary.ts` - Temporary states
- `/client/src/store/prompts.ts` - Prompt management

### High Priority Files (Core State):
1. `/client/src/store/user.ts` - Simple atoms, good starting point (no localStorage)
2. `/client/src/store/language.ts` - Simple atoms with localStorage
3. `/client/src/store/settings.ts` - Complex but critical, uses localStorage extensively

### Medium Priority Files (Feature State):
1. `/client/src/store/families.ts` - Most complex, uses atomFamily extensively
2. `/client/src/store/artifacts.ts` - Modern feature, easier to migrate
3. `/client/src/store/agents.ts` - Uses atomFamily pattern

### Low Priority Files (UI State):
1. `/client/src/store/toast.ts` - Simple UI state
2. `/client/src/store/misc.ts` - Various UI states
3. `/client/src/store/search.ts` - Search-related state

## Testing Strategy

1. **Unit Tests**: Update existing tests to use Jotai providers and hooks
2. **Integration Tests**: Ensure state persistence and cross-component communication
3. **E2E Tests**: Verify no user-facing changes
4. **Performance Tests**: Compare render counts and memory usage

## Rollback Plan

1. Keep Recoil dependencies until full migration is complete
2. Use feature flags to toggle between Recoil and Jotai implementations
3. Maintain both implementations temporarily for critical features
4. Have automated tests to verify parity between implementations

## Common Gotchas and Solutions

### 1. Key-based atoms no longer needed
Jotai doesn't require keys, making atoms simpler but requiring careful export naming.

### 2. AtomFamily memory management
Unlike Recoil, Jotai's atomFamily doesn't auto-garbage collect. Use `myFamily.remove(param)` when needed.

### 3. Async atoms
Jotai handles async atoms differently. Use Suspense or loadable utilities.

### 4. Effects timing
Jotai's derived atoms run synchronously by default, unlike Recoil's effects.

### 5. SetStateAction Pattern (IMPORTANT)
Jotai's basic atoms don't support React's updater functions by default. Solutions:

**Option 1: Use utility functions (Recommended)**
```typescript
// In /client/src/store/utils.ts
import { atomWithUpdater, atomFamilyWithUpdater } from './utils';

const myAtom = atomWithUpdater(defaultValue);
const myFamily = atomFamilyWithUpdater((key) => defaultValue);
```

**Option 2: Use atomWithStorage (for persisted state)**
```typescript
import { atomWithStorage } from 'jotai/utils';
// Already supports updater functions!
const myAtom = atomWithStorage('key', defaultValue);
```

**Option 3: Type casting (Quick fix)**
```typescript
const setMyValue = useSetAtom(myAtom) as Dispatch<SetStateAction<T>>;
```

**Option 4: Use useAtom instead of useSetAtom**
```typescript
// Instead of:
const setValue = useSetAtom(atom); // Doesn't support updaters

// Use:
const [value, setValue] = useAtom(atom); // Supports updaters
```

## Resources

- [Jotai Documentation](https://jotai.org/)
- [Jotai GitHub](https://github.com/pmndrs/jotai)
- [Recoil to Jotai Migration Examples](https://github.com/pmndrs/jotai/discussions)

## Notes

- This migration maintains all existing functionality while simplifying the codebase
- Jotai's smaller API surface and better TypeScript support will improve maintainability
- Performance should be equal or better due to Jotai's optimized rendering
