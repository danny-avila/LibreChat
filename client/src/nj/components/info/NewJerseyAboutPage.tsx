import { HorizontalRule } from '~/nj/components/info/HorizontalRule';
import React from 'react';
import RelatedLinks, { RelatedLinkType } from '~/nj/components/info/RelatedLinks';
import ReactMarkdown from 'react-markdown';
import content from '~/nj/content/about-the-ai-assistant.md?raw';
import LinkRenderer from '~/nj/components/info/LinkRenderer';

/**
 * Content for "about the AI assistant" page
 */
export default function NewJerseyAboutPage() {
  document.title = 'NJ AI Assistant - About';

  const relatedLinks: RelatedLinkType[] = [
    {
      title: 'Guides and FAQS',
      href: '/nj/guide',
      icon: 'local_library',
      isInternal: true,
    },
    {
      title: 'New Jersey Innovation Authority',
      href: 'https://innovation.nj.gov/',
      icon: 'launch',
      isInternal: false,
    },
    {
      title: 'Guidelines on Generative AI use for Public Professionals',
      href: 'https://innovation.nj.gov/skills/ai-how-tos/',
      icon: 'launch',
      isInternal: false,
    },
    {
      title: 'Responsible AI Use Policy in New Jersey',
      href: 'https://nj.gov/it/docs/ps/25-OIT-001-State-of-New-Jersey-Guidance-on-Responsible-Use-of-Generative-AI.pdf',
      icon: 'launch',
      isInternal: false,
    },
  ];

  return (
    <div>
      <ReactMarkdown className="markdown-nj" components={{ a: LinkRenderer }}>
        {content}
      </ReactMarkdown>
      <HorizontalRule spacing="mb-6" />
      <RelatedLinks links={relatedLinks} />
    </div>
  );
}
