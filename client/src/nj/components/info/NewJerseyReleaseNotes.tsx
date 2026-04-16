import React, { useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import releaseNotes from '~/nj/content/release-notes.md?raw';
import { HorizontalRule } from '~/nj/components/info/HorizontalRule';
import RelatedLinks from '~/nj/components/info/RelatedLinks';
import { RelatedLinkType } from '~/nj/components/info/RelatedLinks';
import { logEvent } from '~/nj/analytics/logEvent';
import LinkRenderer from '~/nj/components/info/LinkRenderer';

export default function NewJerseyReleaseNotes() {
  document.title = 'NJ AI Assistant - Release Notes';

  useEffect(() => {
    logEvent('view_release_notes');
  });

  const releaseNotesLinks: RelatedLinkType[] = [
    {
      title: 'Guides and FAQS',
      href: '/nj/guide',
      icon: 'school',
      isInternal: true,
    },
    {
      title: 'About the AI Assistant',
      href: '/nj/about',
      icon: 'local_library',
      isInternal: true,
    },
  ];

  return (
    <div>
      <ReactMarkdown className="markdown-nj" components={{ a: LinkRenderer }}>
        {releaseNotes}
      </ReactMarkdown>
      <HorizontalRule spacing="mb-6" />
      <RelatedLinks links={releaseNotesLinks} />
    </div>
  );
}
