import { useState, useEffect } from 'react';
import type { RelatedLinkType } from '~/nj/components/info/RelatedLinks';
import ResponsibleInfoAlert from '~/nj/components/info/ResponsibleInfoAlert';
import { getGuideContent } from '~/nj/content/parser/njContentRetrieval';
import { HorizontalRule } from '~/nj/components/info/HorizontalRule';
import RelatedLinks from '~/nj/components/info/RelatedLinks';
import AiLearning from '~/nj/components/info/AiLearning';
import FaqSection from '~/nj/components/info/FaqSection';
import InfoTitle from '~/nj/components/info/InfoTitle';

const guideContent = getGuideContent();

const guidesAndFaqsLinks: RelatedLinkType[] = [
  {
    title: 'About the AI Assistant',
    href: '/nj/about',
    icon: 'local_library',
    isInternal: true,
  },
  {
    title: 'New Jersey Innovation Authority',
    href: 'https://innovation.nj.gov/',
    icon: 'launch',
    isInternal: false,
  },
];

export default function NewJerseyGuidePage() {
  useEffect(() => {
    document.title = 'NJ AI Assistant - Guides and FAQs';
  }, []);
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  return (
    <div>
      <InfoTitle text="Guides and FAQs" />
      <HorizontalRule spacing="mb-6" />
      <ResponsibleInfoAlert warning={guideContent.aiAssistantWarning} />
      {guideContent.faqSections.map((section, index) => (
        <FaqSection
          key={section.title}
          title={section.title}
          faqs={section.faqs}
          isLastSection={index === guideContent.faqSections.length - 1}
          openFaq={openFaq}
          setOpenFaq={setOpenFaq}
        />
      ))}
      <HorizontalRule spacing="mb-6" />
      <AiLearning />
      <HorizontalRule spacing="mb-6" />
      <RelatedLinks links={guidesAndFaqsLinks} />
    </div>
  );
}
