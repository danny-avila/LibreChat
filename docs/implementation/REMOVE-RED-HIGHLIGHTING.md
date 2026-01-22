# Remove Red Highlighting After Testing

The new prompt refinement UI components have been temporarily highlighted in red for easy identification during testing. Once testing is complete, use this guide to revert to the default color scheme.

## Files to Modify

### 1. Instructions.tsx - Refine Button

**File:** `client/src/components/SidePanel/Agents/Instructions.tsx`

**Line ~57-67:** Replace the red-highlighted button with the default style:

```tsx
// REMOVE THIS (Red Highlighted):
<button
  type="button"
  onClick={openDialog}
  disabled={!currentInstructions || isRefining}
  className="flex h-7 items-center gap-1 rounded-md border-2 border-red-500 bg-red-50 px-2 py-0 text-sm text-red-700 font-semibold transition-colors duration-200 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
  title={localize('com_ui_refine_instructions') + ' [TESTING - RED HIGHLIGHT]'}
  aria-label="Refine instructions with AI"
>
  <Sparkles className="mr-1 h-3 w-3 text-red-600" aria-hidden={true} />
  {localize('com_ui_refine')}
</button>

// REPLACE WITH THIS (Default Style):
<button
  type="button"
  onClick={openDialog}
  disabled={!currentInstructions || isRefining}
  className="flex h-7 items-center gap-1 rounded-md border border-border-medium bg-surface-secondary px-2 py-0 text-sm text-text-primary transition-colors duration-200 hover:bg-surface-tertiary disabled:cursor-not-allowed disabled:opacity-50"
  title={localize('com_ui_refine_instructions')}
  aria-label="Refine instructions with AI"
>
  <Sparkles className="mr-1 h-3 w-3 text-text-secondary" aria-hidden={true} />
  {localize('com_ui_refine')}
</button>
```

### 2. RefinementDialog.tsx - Dialog Component

**File:** `client/src/components/SidePanel/Agents/PromptRefinement/RefinementDialog.tsx`

**Changes needed:**

#### A. Dialog Content (Line ~57)
```tsx
// REMOVE:
<DialogContent className="max-w-2xl border-4 border-red-500 bg-red-50">

// REPLACE WITH:
<DialogContent className="max-w-2xl">
```

#### B. Dialog Title (Line ~59-62)
```tsx
// REMOVE:
<DialogTitle className="flex items-center gap-2 text-red-700">
  <Sparkles className="h-5 w-5 text-red-600" aria-hidden={true} />
  {localize('com_ui_refine_instructions')} 
  <span className="ml-2 text-xs font-normal text-red-500">[TESTING - RED HIGHLIGHT]</span>
</DialogTitle>

// REPLACE WITH:
<DialogTitle className="flex items-center gap-2">
  <Sparkles className="h-5 w-5 text-text-secondary" aria-hidden={true} />
  {localize('com_ui_refine_instructions')}
</DialogTitle>
```

#### C. Form Label (Line ~70)
```tsx
// REMOVE:
<label
  htmlFor="refinement-request"
  className="text-red-700 mb-2 block font-semibold"
>

// REPLACE WITH:
<label
  htmlFor="refinement-request"
  className="text-token-text-primary mb-2 block font-medium"
>
```

#### D. Textarea (Line ~74)
```tsx
// REMOVE:
<textarea
  id="refinement-request"
  value={refinementRequest}
  onChange={(e) => setRefinementRequest(e.target.value)}
  onKeyDown={handleKeyDown}
  className={cn(inputClass, 'min-h-[120px] resize-y border-2 border-red-300 bg-white focus:border-red-500')}
  placeholder={localize('com_ui_refinement_request_placeholder')}
  rows={5}
  disabled={isLoading}
  aria-label="Refinement request"
/>

// REPLACE WITH:
<textarea
  id="refinement-request"
  value={refinementRequest}
  onChange={(e) => setRefinementRequest(e.target.value)}
  onKeyDown={handleKeyDown}
  className={cn(inputClass, 'min-h-[120px] resize-y')}
  placeholder={localize('com_ui_refinement_request_placeholder')}
  rows={5}
  disabled={isLoading}
  aria-label="Refinement request"
/>
```

#### E. Help Text (Line ~83)
```tsx
// REMOVE:
<p className="mt-2 text-xs text-red-600 font-medium">

// REPLACE WITH:
<p className="mt-2 text-xs text-text-secondary">
```

#### F. Refine Button (Line ~103)
```tsx
// REMOVE:
<Button
  onClick={handleRefine}
  disabled={!refinementRequest.trim() || isLoading}
  aria-label="Apply refinement"
  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white border-2 border-red-700"
>

// REPLACE WITH:
<Button
  onClick={handleRefine}
  disabled={!refinementRequest.trim() || isLoading}
  aria-label="Apply refinement"
  className="flex items-center gap-2"
>
```

## Quick Script (Alternative)

If you prefer, you can use this find-and-replace approach:

### For Instructions.tsx:
1. Find: `border-2 border-red-500 bg-red-50 px-2 py-0 text-sm text-red-700 font-semibold`
   Replace: `border border-border-medium bg-surface-secondary px-2 py-0 text-sm text-text-primary`

2. Find: `hover:bg-red-100`
   Replace: `hover:bg-surface-tertiary`

3. Find: `text-red-600`
   Replace: `text-text-secondary`

4. Find: `+ ' [TESTING - RED HIGHLIGHT]'`
   Replace: `` (empty)

### For RefinementDialog.tsx:
1. Find: `border-4 border-red-500 bg-red-50`
   Replace: `` (empty)

2. Find: `text-red-700`
   Replace: `text-token-text-primary`

3. Find: `text-red-600`
   Replace: `text-text-secondary`

4. Find: `<span className="ml-2 text-xs font-normal text-red-500">[TESTING - RED HIGHLIGHT]</span>`
   Replace: `` (empty)

5. Find: `font-semibold`
   Replace: `font-medium` (in label only)

6. Find: `border-2 border-red-300 bg-white focus:border-red-500`
   Replace: `` (empty)

7. Find: `bg-red-600 hover:bg-red-700 text-white border-2 border-red-700`
   Replace: `` (empty)

## Verification

After making these changes:
1. The "Refine" button should match the "Variables" button style
2. The dialog should use the default modal styling
3. All text should use theme-appropriate colors
4. No red highlighting should remain

## Testing Checklist

Before removing red highlights, verify:
- ✅ Refine button appears and is clickable
- ✅ Dialog opens when clicking Refine
- ✅ Refinement request can be entered
- ✅ Refinement actually works (calls backend, updates instructions)
- ✅ Loading states show correctly
- ✅ Error handling works
- ✅ Success messages appear
- ✅ Instructions field updates with refined text