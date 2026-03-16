import * as Collapsible from '@radix-ui/react-collapsible';
import icons from '@uswds/uswds/img/sprite.svg';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import React from 'react';

export interface FAQ {
  question: string;
  answer: React.ReactNode;
  wrappedQuestionMargin?: string;
}
export interface FAQSectionProps {
  title: string;
  faqs: FAQ[];
}

function CollapsibleSection({ question, answer, wrappedQuestionMargin }: FAQ) {
  return (
    <Collapsible.Root key={question}>
      <Collapsible.Trigger className="group flex w-full justify-between text-left">
        <p className={`font-bold ${wrappedQuestionMargin ?? 'mb-2'}`}>{question}</p>
        <svg
          className="usa-icon usa-icon--size-3 flex-shrink-0 text-jersey-blue transition-transform duration-300 group-data-[state=open]:rotate-180"
          aria-hidden="true"
          focusable="false"
          role="img"
        >
          <use href={`${icons}#expand_more`} />
        </svg>
      </Collapsible.Trigger>
      <Collapsible.Content>{answer}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export default function FaqSection({ title, faqs }: FAQSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoSectionHeader text={title} />

        <div className="mb-3 flex flex-col gap-4">
          {faqs.map((faq) => {
            return (
              <CollapsibleSection
                key={faq.question}
                question={faq.question}
                answer={faq.answer}
                wrappedQuestionMargin={faq.wrappedQuestionMargin}
              ></CollapsibleSection>
            );
          })}
        </div>
      </div>
    </>
  );
}
