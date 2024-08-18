import React from 'react';
import { handleDoubleClick } from '~/utils';

export const CodeVariableGfm = ({ children }: { children: React.ReactNode }) => {
  return (
    <code
      onDoubleClick={handleDoubleClick}
      className="rounded-md bg-surface-primary-alt p-1 text-xs text-text-secondary md:text-sm"
    >
      {children}
    </code>
  );
};

const regex = /{{(.*?)}}/g;
export const PromptVariableGfm = ({
  children,
}: {
  children: React.ReactNode & React.ReactNode[];
}) => {
  const renderContent = (child: React.ReactNode) => {
    if (typeof child === 'object' && child !== null) {
      return child;
    }
    if (typeof child !== 'string') {
      return child;
    }

    const parts = child.split(regex);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <b key={index} className="rounded-md bg-yellow-100/90 p-1 text-gray-700">
          {`{{${part}}}`}
        </b>
      ) : (
        part
      ),
    );
  };

  return <p>{React.Children.map(children, (child) => renderContent(child))}</p>;
};
