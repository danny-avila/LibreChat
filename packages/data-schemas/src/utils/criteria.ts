/** A criterion that matches a single value or any one of several. */
export type OneOrMany<T> = T | T[];

/** Maps every criterion of a domain query to the field it is stored under. */
export type FieldMap<TQuery> = Readonly<Record<keyof TQuery & string, string>>;

/**
 * Translates a scalar-or-list criterion into a Mongo match expression. Domain
 * query types express "any of these" as an array; the engine spells it.
 */
export function matchAny<T>(value: OneOrMany<T>): T | { $in: T[] } {
  return Array.isArray(value) ? { $in: value } : value;
}

/**
 * Builds a Mongo filter from a domain query, omitting criteria the caller left
 * undefined.
 *
 * Throws on any criterion the field map does not cover. Callers in `api/` are
 * JavaScript and get no compile-time checking, and a silently dropped criterion
 * would widen the filter — an unscoped `findOne` returns an arbitrary document
 * rather than none, and an unscoped `deleteMany` removes every document — so
 * this fails closed instead.
 *
 * Every key is validated before the undefined-omission rule is applied: a
 * misspelled criterion that happens to carry `undefined` must still be rejected,
 * not quietly skipped. The lookup is an own-property check so that inherited
 * names like `toString` cannot resolve through the field map's prototype.
 */
export function buildFilter<TQuery extends object, TFilter>(
  query: TQuery,
  fields: FieldMap<TQuery>,
): TFilter {
  const filter: Record<string, unknown> = {};
  for (const key of Object.keys(query) as Array<keyof TQuery & string>) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) {
      throw new Error(`Unknown query criterion: '${key}'`);
    }
    const value = query[key];
    if (value === undefined) {
      continue;
    }
    filter[fields[key]] = matchAny(value);
  }
  return filter as TFilter;
}
