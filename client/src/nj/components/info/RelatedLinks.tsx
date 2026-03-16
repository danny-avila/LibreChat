/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import InfoLink from '~/nj/components/info/InfoLink';
import InfoSectionHeader from '~/nj/components/info/InfoSectionHeader';
import icons from '@uswds/uswds/img/sprite.svg';
import { Link } from 'react-router-dom';

export default function RelatedLinks() {
  return (
    <div>
      <InfoSectionHeader text="Related links" />
      <div className="mb-6 space-y-3">
        <div>
          <Link
            to={{ pathname: '/nj/about' }}
            className="inline-flex gap-1 underline hover:decoration-2"
          >
            About the AI Assistant
            <div className="inline-flex rounded bg-surface-secondary p-1">
              <svg
                className="usa-icon usa-icon--size-2"
                aria-hidden="true"
                focusable="false"
                role="img"
              >
                <use href={`${icons}#local_library`} />
              </svg>
            </div>
          </Link>
        </div>
        <InfoLink
          text="New Jersey Innovation Authority"
          link="https://innovation.nj.gov/"
          icon="launch"
        />
      </div>
    </div>
  );
}
