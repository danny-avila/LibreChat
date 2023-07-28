import React from 'react';
import WritingAssistant from './WritingAssistant';

export default function ChatWidget({ type }: {type: string}) {
  let widget: null | React.JSX.Element = null;

  switch (type) {
    default: return null;
    case ('wa'): widget = <WritingAssistant />;
  }

  return(
    <div className="flex mt-3 mb-5 mx-2 overflow-y-scroll justify-center">
      {widget}
    </div>
  );
}
