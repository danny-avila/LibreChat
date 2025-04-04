import { memo } from 'react';

const EmptyTextPart = memo(() => {
  return (
    <div className="text-message mb-[0.625rem] flex min-h-[20px] flex-col items-start gap-3 overflow-visible">
      <div className="markdown prose dark:prose-invert light w-full break-words dark:text-gray-100">
        <div className="absolute">
          <p className="submitting relative">
            <span className="result-thinking" />
          </p>
        </div>
      </div>
    </div>
  );
});

export default EmptyTextPart;
