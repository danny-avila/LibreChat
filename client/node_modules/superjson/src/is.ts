const getType = (payload: any): string =>
  Object.prototype.toString.call(payload).slice(8, -1);

export const isUndefined = (payload: any): payload is undefined =>
  typeof payload === 'undefined';

export const isNull = (payload: any): payload is null => payload === null;

export const isPlainObject = (
  payload: any
): payload is { [key: string]: any } => {
  if (typeof payload !== 'object' || payload === null) return false;
  if (payload === Object.prototype) return false;
  if (Object.getPrototypeOf(payload) === null) return true;

  return Object.getPrototypeOf(payload) === Object.prototype;
};

export const isEmptyObject = (payload: any): payload is {} =>
  isPlainObject(payload) && Object.keys(payload).length === 0;

export const isArray = (payload: any): payload is any[] =>
  Array.isArray(payload);

export const isString = (payload: any): payload is string =>
  typeof payload === 'string';

export const isNumber = (payload: any): payload is number =>
  typeof payload === 'number' && !isNaN(payload);

export const isBoolean = (payload: any): payload is boolean =>
  typeof payload === 'boolean';

export const isRegExp = (payload: any): payload is RegExp =>
  payload instanceof RegExp;

export const isMap = (payload: any): payload is Map<any, any> =>
  payload instanceof Map;

export const isSet = (payload: any): payload is Set<any> =>
  payload instanceof Set;

export const isSymbol = (payload: any): payload is symbol =>
  getType(payload) === 'Symbol';

export const isDate = (payload: any): payload is Date =>
  payload instanceof Date && !isNaN(payload.valueOf());

export const isError = (payload: any): payload is Error =>
  payload instanceof Error;

export const isNaNValue = (payload: any): payload is typeof NaN =>
  typeof payload === 'number' && isNaN(payload);

export const isPrimitive = (
  payload: any
): payload is boolean | null | undefined | number | string | symbol =>
  isBoolean(payload) ||
  isNull(payload) ||
  isUndefined(payload) ||
  isNumber(payload) ||
  isString(payload) ||
  isSymbol(payload);

export const isBigint = (payload: any): payload is bigint =>
  typeof payload === 'bigint';

export const isInfinite = (payload: any): payload is number =>
  payload === Infinity || payload === -Infinity;

export type TypedArrayConstructor =
  | Int8ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Int16ArrayConstructor
  | Uint16ArrayConstructor
  | Int32ArrayConstructor
  | Uint32ArrayConstructor
  | Float32ArrayConstructor
  | Float64ArrayConstructor;

export type TypedArray = InstanceType<TypedArrayConstructor>;

export const isTypedArray = (payload: any): payload is TypedArray =>
  ArrayBuffer.isView(payload) && !(payload instanceof DataView);

export const isURL = (payload: any): payload is URL => payload instanceof URL;
