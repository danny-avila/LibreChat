import React from 'react';
import { handleDoubleClick } from '~/utils';

export const CodeVariableGfm: React.ElementType = ({ children }: { children: React.ReactNode }) => {
  return (
    <code
      onDoubleClick={handleDoubleClick}
      className="rounded-md bg-surface-primary-alt p-1 text-xs text-text-secondary md:text-sm"
    >
      {children}
    </code>
  );
};

const variableRegex = /{{(.*?)}}/g;

const highlightVariables = (text: string): React.ReactNode[] => {
  const parts = text.split(variableRegex);
  return parts.map((part, index) => {
    if (index % 2 === 1) {
      return (
        <b
          key={index}
          className="ml-[0.5] rounded-lg bg-amber-100 p-[1px] font-medium text-yellow-800 dark:border-yellow-500/50 dark:bg-transparent dark:text-yellow-500/90"
        >
          {`{{${part}}}`}
        </b>
      );
    }
    return part;
  });
};

const processChildren = (children: React.ReactNode): React.ReactNode => {
  if (typeof children === 'string') {
    return highlightVariables(children);
  }

  if (Array.isArray(children)) {
    return children.map((child, index) => (
      <React.Fragment key={index}>{processChildren(child)}</React.Fragment>
    ));
  }

  if (React.isValidElement(children)) {
    const element = children as React.ReactElement<{ children?: React.ReactNode }>;
    if (element.props.children) {
      return React.cloneElement(element, {
        ...element.props,
        children: processChildren(element.props.children),
      });
    }
    return children;
  }

  return children;
};

export const PromptVariableGfm = ({
  children,
}: {
  children: React.ReactNode & React.ReactNode[];
}) => {
  return <p>{processChildren(children)}</p>;
};
