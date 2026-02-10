/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { DropdownMenuSeparator } from '@librechat/client';
import * as Select from '@ariakit/react/select';
import { useNavigate } from 'react-router-dom';
import icons from '@uswds/uswds/img/sprite.svg';
import React from 'react';

/**
 * New Jersey-specific menu items that show up in the AccountSettings popup.
 */
export function NewJerseySelectItems() {
  const navigate = useNavigate();

  return (
    <>
      <Select.SelectItem
        value=""
        onClick={() => navigate('nj/guide')}
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#school`} />
        </svg>
        Guides & FAQs
      </Select.SelectItem>

      <Select.SelectItem
        value=""
        onClick={() => navigate('nj/about')}
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#local_library`} />
        </svg>
        About the AI Assistant
      </Select.SelectItem>

      <DropdownMenuSeparator />

      <Select.SelectItem
        value=""
        onClick={() => window.open('https://forms.office.com/g/zLiSuXxJ0Y', '_blank')}
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#mail`} />
        </svg>
        Contact us
      </Select.SelectItem>

      <Select.SelectItem
        value=""
        onClick={() =>
          window.open('https://public.govdelivery.com/accounts/NJGOV/signup/45878', '_blank')
        }
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#notifications`} />
        </svg>
        Get updates
      </Select.SelectItem>

      <DropdownMenuSeparator />
    </>
  );
}
