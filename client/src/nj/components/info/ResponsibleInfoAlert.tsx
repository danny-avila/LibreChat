/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import ReactMarkdown from 'react-markdown';
import LinkRenderer from '~/nj/components/info/LinkRenderer';
import type { AIAssistantWarning } from '~/nj/content/parser/njContentRetrieval';

interface Props {
  warning: AIAssistantWarning;
}

export default function ResponsibleInfoAlert({ warning }: Props) {
  return (
    <div
      // prettier-ignore
      className="border-info bg-info-lighter mb-10 w-full border text-primary p-5 rounded"
      role="alert"
    >
      <div className="flex">
        <div className="py-1">
          <svg
            className="mr-4 h-6 w-6 fill-current text-primary"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
          >
            <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zm12.73-1.41A8 8 0 1 0 4.34 4.34a8 8 0 0 0 11.32 11.32zM9 11V9h2v6H9v-4zm0-6h2v2H9V5z" />
          </svg>
        </div>
        <div className="flex-1">
          <h2 className="mb-4 text-2xl">{warning.title}</h2>
        </div>
      </div>
      <ReactMarkdown className="markdown-nj" components={{ a: LinkRenderer }}>
        {warning.warning}
      </ReactMarkdown>
    </div>
  );
}
