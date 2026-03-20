/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQ, FAQSectionProps } from '~/nj/components/info/FaqSection';

const helpSupportFAQs: FAQ[] = [
  {
    question: 'How can I get in touch with the team?',
    answer: (
      <p className="mb-6">
        To share feedback, report a problem, ask a question, or request help with prompting/using AI
        — either fill out the{' '}
        <a
          href="https://forms.office.com/g/zLiSuXxJ0Y"
          className="underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="Contact Us Form (opens in new window)"
        >
          Contact Us Form
        </a>{' '}
        or send us an email at{' '}
        <a href="mailto:AI.Assistant@innovation.nj.gov" className="underline hover:decoration-2">
          AI.Assistant@innovation.nj.gov
        </a>{' '}
        — both go directly to the team.
      </p>
    ),
  },
];

export default function HelpAndSupport({
  openFaq,
  setOpenFaq,
}: Pick<FAQSectionProps, 'openFaq' | 'setOpenFaq'>) {
  return (
    <FaqSection
      title={'Help & Support'}
      faqs={helpSupportFAQs}
      openFaq={openFaq}
      setOpenFaq={setOpenFaq}
    />
  );
}
