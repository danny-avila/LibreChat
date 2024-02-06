export default function myRemarkPluginAddingComp(
  this: import('unified').Processor<void, import('mdast').Root, void, void>
):
  | void
  | import('unified').Transformer<import('mdast').Root, import('mdast').Root>
