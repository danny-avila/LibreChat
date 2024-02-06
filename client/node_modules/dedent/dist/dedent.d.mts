interface DedentOptions {
    escapeSpecialCharacters?: boolean;
}
interface Dedent {
    (literals: string): string;
    (strings: TemplateStringsArray, ...values: unknown[]): string;
    withOptions: CreateDedent;
}
type CreateDedent = (options: DedentOptions) => Dedent;

declare const _default: {
    (literals: string): string;
    (strings: TemplateStringsArray, ...values: unknown[]): string;
    withOptions(newOptions: DedentOptions): any;
};

export { CreateDedent, Dedent, DedentOptions, _default as default };
