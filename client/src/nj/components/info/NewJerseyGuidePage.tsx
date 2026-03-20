import { HorizontalRule } from '~/nj/components/info/HorizontalRule';
import InfoTitle from '~/nj/components/info/InfoTitle';
import React from 'react';
import ResponsibleInfoAlert from '~/nj/components/info/ResponsibleInfoAlert';
import GettingStarted from '~/nj/components/info/GettingStarted';
import UsingAIAsst from '~/nj/components/info/UsingAIAsst';
import HelpAndSupport from '~/nj/components/info/HelpAndSupport';
import UpcomingFeatures from '~/nj/components/info/UpcomingFeatures';
import AiLearning from '~/nj/components/info/AiLearning';
import RelatedLinks from '~/nj/components/info/RelatedLinks';
import { useState } from 'react';

/**
 * Content for "guide to using the assistant" page
 */
export default function NewJerseyGuidePage() {
  document.title = 'NJ AI Assistant - Guides and FAQs';
  const [openFaq, setOpenFaq] = useState<string | null>(null);

  return (
    <div>
      <InfoTitle text="Guides and FAQs" />
      <HorizontalRule spacing="mb-6" />
      <ResponsibleInfoAlert />
      <GettingStarted openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <UsingAIAsst openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <HelpAndSupport openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <UpcomingFeatures openFaq={openFaq} setOpenFaq={setOpenFaq} />
      <HorizontalRule spacing="mb-6" />
      <AiLearning />
      <HorizontalRule spacing="mb-6" />
      <RelatedLinks />
    </div>
  );
}
