import * as Collapsible from '@radix-ui/react-collapsible';
import icons from '@uswds/uswds/img/sprite.svg';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import { HorizontalRule } from '~/nj/components/info/HorizontalRule';

export interface FAQ {
  question: string;
  answer: React.ReactNode;
  wrappedQuestionMargin?: string;
}
export interface FAQSectionProps {
  title: string;
  faqs: FAQ[];
  isLastSection?: boolean;
  openFaq: string | null;
  setOpenFaq: (open: string | null) => void;
}

interface CollapsibleSectionProps extends FAQ {
  isOpen: boolean;
  handleOpen: (open: boolean) => void;
}

function CollapsibleSection({
  question,
  answer,
  wrappedQuestionMargin,
  isOpen,
  handleOpen,
}: CollapsibleSectionProps) {
  return (
    <Collapsible.Root open={isOpen} onOpenChange={handleOpen}>
      <Collapsible.Trigger className="group flex w-full justify-between text-left">
        <p
          className={`font-normal ${wrappedQuestionMargin ?? 'mb-2'} group-data-[state=open]:font-semibold`}
        >
          {question}
        </p>
        <svg
          className="usa-icon usa-icon--size-3 flex-shrink-0 text-jersey-blue transition-transform duration-300 group-data-[state=open]:rotate-180"
          aria-hidden="true"
          focusable="false"
        >
          <use href={`${icons}#expand_more`} />
        </svg>
      </Collapsible.Trigger>
      <Collapsible.Content>{answer}</Collapsible.Content>
    </Collapsible.Root>
  );
}

export default function FaqSection({
  title,
  faqs,
  isLastSection,
  openFaq,
  setOpenFaq,
}: FAQSectionProps) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <InfoSectionHeader text={title} />

        <div className="mb-8 flex flex-col gap-4">
          {faqs.map((faq, index) => {
            const isLastFaqOnPage = isLastSection && index === faqs.length - 1;
            return (
              <>
                <CollapsibleSection
                  key={faq.question}
                  question={faq.question}
                  answer={faq.answer}
                  wrappedQuestionMargin={faq.wrappedQuestionMargin}
                  isOpen={openFaq === faq.question}
                  handleOpen={(open) => setOpenFaq(open ? faq.question : null)}
                ></CollapsibleSection>
                {!isLastFaqOnPage && <HorizontalRule spacing="mb-4" />}
              </>
            );
          })}
        </div>
      </div>
    </>
  );
}
