import { visit } from 'unist-util-visit';
import type { Plugin } from 'unified';
import type { Root } from 'mdast';

export function artifactPlugin() {
  return (tree) => {
    visit(
      tree,
      ['textDirective', 'leafDirective', 'containerDirective'],
      (node) => {
        node.data = {
          hName: node.name,
          hProperties: node.attributes,
          ...node.data,
        };
        return node;
      },
    );
  };
}

export function artifact({ node, ...props }) {
  // if (props.className === 'artifact') {
  console.dir(props, { depth: null });
  return (
    <div className="artifact">
      <h3>{props.dataIdentifier}</h3>
      <p>Type: {props.dataType}</p>
      {props.children}
    </div>
  );
  // }
  // return <div {...props} />;
}