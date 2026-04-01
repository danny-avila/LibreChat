/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import FaqSection, { FAQ, FAQSectionProps } from '~/nj/components/info/FaqSection';

const upcomingFeaturesFAQs: FAQ[] = [
  {
    question: "What's coming next for NJ AI Assistant?",
    answer: (
      <ul className="mb-6 list-outside list-disc pl-8">
        <li className="mb-2">
          To stay updated on new features, learning resources, and all things AI, join{' '}
          <a
            href="https://public.govdelivery.com/accounts/NJGOV/signup/45878"
            className="font-normal text-primary underline hover:decoration-2"
            target="_blank"
            rel="noreferrer"
            aria-label="our newsletter about the NJ AI Assistant (open in new window)"
          >
            our newsletter about the NJ AI Assistant
          </a>
          .
        </li>
        <li className="mb-2">
          To hear specifically about release features, check out our{' '}
          <a
            href="/nj/release-notes"
            className="font-normal text-primary underline hover:decoration-2"
          >
            Release Notes
          </a>{' '}
          page.
        </li>
        <li className="mb-2">
          In the immediate future, the team is thinking about more features to support responsible
          and safe AI use. We are also writing how-to guides for effective prompting and sharing AI
          use cases.
        </li>
      </ul>
    ),
  },
];

export default function UpcomingFeatures({
  openFaq,
  setOpenFaq,
}: Pick<FAQSectionProps, 'openFaq' | 'setOpenFaq'>) {
  return (
    <FaqSection
      title={'Upcoming features'}
      faqs={upcomingFeaturesFAQs}
      isLastSection={true}
      openFaq={openFaq}
      setOpenFaq={setOpenFaq}
    />
  );
}
