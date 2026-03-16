import InfoDivider from '~/nj/components/info/InfoDivider';
import InfoTitle from '~/nj/components/info/InfoTitle';
import React from 'react';
import ResponsibleInfoAlert from '~/nj/components/info/ResponsibleInfoAlert';
import GettingStarted from '~/nj/components/info/GettingStarted';
import UsingAIAsst from '~/nj/components/info/UsingAIAsst';
import HelpAndSupport from '~/nj/components/info/HelpAndSupport';
import UpcomingFeatures from '~/nj/components/info/UpcomingFeatures';
import AiLearning from '~/nj/components/info/AiLearning';
import RelatedLinks from '~/nj/components/info/RelatedLinks';

/**
 * Content for "guide to using the assistant" page
 */
export default function NewJerseyGuidePage() {
  document.title = 'NJ AI Assistant - Guides and FAQs';
  return (
    <div>
      <InfoTitle text="Guides and FAQs" />
      <InfoDivider />
      <ResponsibleInfoAlert />
      <GettingStarted />
      <InfoDivider />
      <UsingAIAsst />
      <InfoDivider />
      <HelpAndSupport />
      <InfoDivider />
      <UpcomingFeatures />
      <InfoDivider />
      <AiLearning />
      <InfoDivider />
      <RelatedLinks />
    </div>
  );
}
