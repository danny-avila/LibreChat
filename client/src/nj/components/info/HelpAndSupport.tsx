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
  {
    question: 'How do I attend AI Office Hours?',
    answer: (
      <p className="mb-6">
        Join weekly AI Office Hours to learn more about AI and prompting, the NJ AI Assistant, or
        get help on a project you’re working on.
        <ul className="list-inside list-disc">
          <li>
            Office Hours are weekly on Thursdays from 12:30 - 1:30 pm. You can use{' '}
            <a
              href="https://teams.microsoft.com/meet/27661582151645?p=78SP1n7rYEGoorbxsn"
              className="underline hover:decoration-2"
              target="_blank"
              rel="noreferrer"
              aria-label="Teams Meeting Link (opens in new window)"
            >
              this Teams link
            </a>{' '}
            to access it.
          </li>
          <li>
            If you have a question and cannot make office hours, feel free to email us at{' '}
            <a
              href="mailto:AI.Assistant@innovation.nj.gov"
              className="underline hover:decoration-2"
              target="_blank"
              rel="noreferrer"
              aria-label="AI.Assistant@innovation.nj.gov (opens in new window)"
            >
              AI.Assistant@innovation.nj.gov
            </a>{' '}
            instead.
          </li>
        </ul>
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
