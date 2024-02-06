export type ExtractTagName<
  SimpleSelector extends string,
  DefaultTagName extends string
> = SimpleSelector extends `#${infer Rest}`
  ? DefaultTagName
  : SimpleSelector extends `.${infer Rest}`
  ? DefaultTagName
  : SimpleSelector extends `${infer TagName}.${infer Rest}`
  ? ExtractTagName<TagName, DefaultTagName>
  : SimpleSelector extends `${infer TagName}#${infer Rest}`
  ? TagName
  : SimpleSelector extends ''
  ? DefaultTagName
  : SimpleSelector extends string
  ? SimpleSelector
  : DefaultTagName
