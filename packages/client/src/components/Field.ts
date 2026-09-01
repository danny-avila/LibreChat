/**
 * The shared appearance of a form control — border, radius, type scale and focus
 * treatment. Owned here so `Input`, `Textarea`, and the select/combobox triggers
 * that have to sit beside them in a form cannot drift apart as the theme evolves.
 * Callers compose a variant rather than restating these classes locally.
 */
export const fieldBase: string =
  'lc-field flex w-full rounded-lg border border-border-light px-3 py-2 text-sm text-text-primary placeholder:text-text-secondary focus-visible:border-border-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-text-primary disabled:cursor-not-allowed disabled:opacity-50';

/** A single-line control sized to sit in a form row, matching `Input`. */
export const fieldControl: string = `${fieldBase} h-10 bg-transparent`;
