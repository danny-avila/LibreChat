import { JSONValue } from './types';
import { find } from './util';

export interface CustomTransfomer<I, O extends JSONValue> {
  name: string;
  isApplicable: (v: any) => v is I;
  serialize: (v: I) => O;
  deserialize: (v: O) => I;
}

export class CustomTransformerRegistry {
  private transfomers: Record<string, CustomTransfomer<any, any>> = {};

  register<I, O extends JSONValue>(transformer: CustomTransfomer<I, O>) {
    this.transfomers[transformer.name] = transformer;
  }

  findApplicable<T>(v: T) {
    return find(this.transfomers, transformer =>
      transformer.isApplicable(v)
    ) as CustomTransfomer<T, JSONValue> | undefined;
  }

  findByName(name: string) {
    return this.transfomers[name];
  }
}
