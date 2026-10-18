import type { z } from 'zod';

type Validator<I, O> = z.ZodType<O, z.ZodTypeDef, I> | ((input: I) => O);

/**
 * The admin panel's data functions, in the builder shape they were written in. Inside SassyChat
 * there is no separate server: each one runs in the browser, validates its input, and calls the
 * admin API through `apiFetch`, which the server authorizes on every request.
 */
export function createServerFn(_options?: { method?: 'GET' | 'POST' }) {
  return {
    handler<R>(fn: () => Promise<R>): () => Promise<R> {
      return () => fn();
    },
    inputValidator<I, O>(validator: Validator<I, O>) {
      const parse = (input: I): O =>
        typeof validator === 'function' ? validator(input) : validator.parse(input);
      return {
        handler<R>(fn: (context: { data: O }) => Promise<R>): (input: { data: I }) => Promise<R> {
          return async (input) => fn({ data: parse(input.data) });
        },
      };
    },
  };
}
