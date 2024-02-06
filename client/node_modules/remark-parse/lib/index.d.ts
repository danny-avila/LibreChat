export default function remarkParse(
  this: import('unified').Processor<
    import('mdast').Root,
    import('mdast').Root,
    void,
    void
  >,
  ...settings: [import('mdast-util-from-markdown').Options?] | void[]
): void
export type Root = import('mdast').Root
export type Options = import('mdast-util-from-markdown').Options
