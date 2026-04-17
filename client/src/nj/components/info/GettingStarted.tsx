/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQSectionProps } from '~/nj/components/info/FaqSection';
import React from 'react';

const gettingStartedFaqs = [
  {
    question: 'How do I write a prompt that will get good results?',
    answer: (
      <>
        <p className="mb-3">
          Our team created{' '}
          <a
            href="https://innovation.nj.gov/skills/ai-how-tos/prompts-and-context"
            className="inline-flex items-center gap-1 underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
            aria-label="this prompting guide (opens in new window)"
          >
            this prompting guide
          </a>{' '}
          to walk through how to use prompts and context to improve AI results. This covers how to
          think about AI tools, general prompt tips, concrete actions to improve the AI response
          quality and reduce hallucinations, a checklist to review AI outputs, and a troubleshooting
          guide.
        </p>
      </>
    ),
  },
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
];

export default function GettingStarted({
  openFaq,
  setOpenFaq,
}: Pick<FAQSectionProps, 'openFaq' | 'setOpenFaq'>) {
  return (
    <FaqSection
      title="Getting Started"
      faqs={gettingStartedFaqs}
      openFaq={openFaq}
      setOpenFaq={setOpenFaq}
    />
  );
}
