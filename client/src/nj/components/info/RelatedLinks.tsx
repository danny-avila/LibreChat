/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import InfoLink from '~/nj/components/info/InfoLink';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import icons from '@uswds/uswds/img/sprite.svg';
import { Link } from 'react-router-dom';

export interface RelatedLinkType {
  title: string;
  href: string;
  icon: string;
  isInternal: boolean;
}

export interface RelatedLinksProps {
  links: RelatedLinkType[];
}

// export default function RelatedLinks() {
export default function RelatedLinks({ links }: RelatedLinksProps) {
  return (
    <div className="flex-column mb-8 mt-8">
      <InfoSectionHeader text="Related links" />
      <div className="mb-6 flex flex-col space-y-3">
        {links.map((link) => {
          const content = (
            <>
              {link.title}
              <div className="inline-flex rounded bg-surface-secondary p-1">
                <svg
                  className="usa-icon usa-icon--size-2"
                  aria-hidden="true"
                  focusable="false"
                  role="img"
                >
                  <use href={`${icons}#${link.icon}`} />
                </svg>
              </div>
            </>
          );
          return link.isInternal ? (
            <Link
              key={link.href}
              to={{ pathname: link.href }}
              className="inline-flex gap-1 underline hover:decoration-2"
            >
              {content}
            </Link>
          ) : (
            <InfoLink text={link.title} link={link.href} icon={link.icon} />
          );
        })}
      </div>
    </div>
  );
}
