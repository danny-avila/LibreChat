/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQ, FAQSectionProps } from '~/nj/components/info/FaqSection';
import React from 'react';

const helpSupportFAQs: FAQ[] = [
  {
    question: 'Are there AI Office Hours to support my AI work?',
    answer: (
      <p className="mb-6">
        Join weekly AI Office Hours to discuss AI, a project you’re working on, or feedback about
        the NJ AI Assistant.{' '}
        <a
          href="https://outlook.office365.com/book/AIOfficeHours1@SoNJ.onmicrosoft.com/s/5Hx9mVbMJUK8H1YcXwEr6A2?ismsaljsauthenabled"
          className="inline-flex items-center gap-1 underline hover:decoration-2"
          target="_blank"
          rel="noreferrer"
          aria-label="Book time on any Thursday (opens in new window)"
        >
          Book time on any Thursday
        </a>{' '}
        with the team.
      </p>
    ),
  },
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
