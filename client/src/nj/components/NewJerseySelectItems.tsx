/* eslint-disable i18next/no-literal-string */
/* ^ We're not worried about i18n for this app ^ */

import { DropdownMenuSeparator } from '@librechat/client';
import * as Menu from '@ariakit/react/menu';
import { useNavigate, useLocation } from 'react-router-dom';
import icons from '@uswds/uswds/img/sprite.svg';
import React, { useState } from 'react';
import ModelInformationModal from './ModelInformationModal';
import ArchivedChatsModal from './ArchivedChatsModal';
import ArchiveIcon from '~/nj/svgs/ArchiveIcon';

/**
 * New Jersey-specific menu items that show up in the AccountSettings popup.
 */
export function NewJerseySelectItems() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [modelInfoOpen, setModelInfoOpen] = useState(false);
  const [archivedChatsOpen, setArchivedChatsOpen] = useState(false);

  return (
    <>
      <Menu.MenuItem onClick={() => setArchivedChatsOpen(true)} className="select-item text-sm">
        <ArchiveIcon height={16} />
        Archived chats
      </Menu.MenuItem>

      <DropdownMenuSeparator />

      <Menu.MenuItem onClick={() => navigate('nj/guide')} className="select-item text-sm">
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#school`} />
        </svg>
        Guides & FAQs
      </Menu.MenuItem>

      <Menu.MenuItem onClick={() => navigate('nj/about')} className="select-item text-sm">
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#local_library`} />
        </svg>
        About the AI Assistant
      </Menu.MenuItem>

      <Menu.MenuItem onClick={() => navigate('nj/release-notes')} className="select-item text-sm">
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#construction`} />
        </svg>
        Release Notes
      </Menu.MenuItem>

      <DropdownMenuSeparator />

      {/* We only want to show model info option when you're actually talking w/ a model.
      Otherwise, it's ambiguous what model you're working with (if support multiple models) */}
      {pathname.startsWith('/c/') && (
        <Menu.MenuItem onClick={() => setModelInfoOpen(true)} className="select-item text-sm">
          <svg
            className="usa-icon usa-icon--size-2"
            aria-hidden="true"
            focusable="false"
            role="img"
          >
            <use href={`${icons}#help`} />
          </svg>
          Model information
        </Menu.MenuItem>
      )}

      <Menu.MenuItem
        onClick={() => window.open('https://forms.office.com/g/zLiSuXxJ0Y', '_blank')}
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#mail`} />
        </svg>
        Contact us<span className="sr-only"> (opens link in new window)</span>
      </Menu.MenuItem>

      <Menu.MenuItem
        onClick={() =>
          window.open('https://public.govdelivery.com/accounts/NJGOV/signup/45878', '_blank')
        }
        className="select-item text-sm"
      >
        <svg className="usa-icon usa-icon--size-2" aria-hidden="true" focusable="false" role="img">
          <use href={`${icons}#notifications`} />
        </svg>
        Get updates<span className="sr-only"> (opens link in new window)</span>
      </Menu.MenuItem>

      <DropdownMenuSeparator />

      <ModelInformationModal open={modelInfoOpen} onOpenChange={setModelInfoOpen} />
      <ArchivedChatsModal open={archivedChatsOpen} onOpenChange={setArchivedChatsOpen} />
    </>
  );
}
