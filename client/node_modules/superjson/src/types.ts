import { TypeAnnotation } from './transformer';
import { MinimisedTree, ReferentialEqualityAnnotations } from './plainer';

export type Class = { new (...args: any[]): any };

export type PrimitiveJSONValue = string | number | boolean | undefined | null;

export type JSONValue = PrimitiveJSONValue | JSONArray | JSONObject;

export interface JSONArray extends Array<JSONValue> {}

export interface JSONObject {
  [key: string]: JSONValue;
}

type ClassInstance = any;

export type SerializableJSONValue =
  | Symbol
  | Set<SuperJSONValue>
  | Map<SuperJSONValue, SuperJSONValue>
  | undefined
  | bigint
  | Date
  | ClassInstance
  | RegExp;

export type SuperJSONValue =
  | JSONValue
  | SerializableJSONValue
  | SuperJSONArray
  | SuperJSONObject;

export interface SuperJSONArray extends Array<SuperJSONValue> {}

export interface SuperJSONObject {
  [key: string]: SuperJSONValue;
}

export interface SuperJSONResult {
  json: JSONValue;
  meta?: {
    values?: MinimisedTree<TypeAnnotation>;
    referentialEqualities?: ReferentialEqualityAnnotations;
  };
}
