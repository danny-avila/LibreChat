import { memo, useRef, useState } from 'react';
import * as Menu from '@ariakit/react/menu';
import { Archive, FileText, LogOut } from 'lucide-react';
import { DropdownMenuSeparator, OGDialog, OGDialogTemplate, Avatar } from '@librechat/client';
import { MyFilesModal } from '~/components/Chat/Input/Files/MyFilesModal';
import { useGetStartupConfig, useGetUserBalance } from '~/data-provider';
import ArchivedChatsTable from './SettingsTabs/General/ArchivedChatsTable';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

// BKL: 마이메뉴는 내 파일(라이브러리) / 보관된 채팅 / 로그아웃만 노출. 도움말 / 설정 항목은 제거.
function AccountSettings() {
  const localize = useLocalize();
  const { user, isAuthenticated, logout } = useAuthContext();
  const { data: startupConfig } = useGetStartupConfig();
  const balanceQuery = useGetUserBalance({
    enabled: !!isAuthenticated && startupConfig?.balance?.enabled,
  });
  const accountSettingsButtonRef = useRef<HTMLButtonElement>(null);
  const [isArchiveOpen, setIsArchiveOpen] = useState(false);
  const [isFilesOpen, setIsFilesOpen] = useState(false);

  return (
    <Menu.MenuProvider>
      <Menu.MenuButton
        ref={accountSettingsButtonRef}
        aria-label={localize('com_nav_account_settings')}
        data-testid="nav-user"
        className="mt-text-sm flex h-auto w-full items-center gap-2 rounded-xl p-2 text-sm transition-all duration-200 ease-in-out hover:bg-surface-active-alt aria-[expanded=true]:bg-surface-active-alt"
      >
        <div className="-ml-0.9 -mt-0.8 h-8 w-8 flex-shrink-0">
          <div className="relative flex">
            <Avatar user={user} size={32} />
          </div>
        </div>
        <div
          className="mt-2 grow overflow-hidden text-ellipsis whitespace-nowrap text-left text-text-primary"
          style={{ marginTop: '0', marginLeft: '0' }}
        >
          {user?.name ?? user?.username ?? localize('com_nav_user')}
        </div>
      </Menu.MenuButton>
      <Menu.Menu
        className="account-settings-popover popover-ui z-[125] w-[305px] rounded-lg md:w-[244px]"
        style={{
          transformOrigin: 'bottom',
          translate: '0 -4px',
        }}
      >
        <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
          {user?.email ?? localize('com_nav_user')}
        </div>
        <DropdownMenuSeparator />
        {startupConfig?.balance?.enabled === true && balanceQuery.data != null && (
          <>
            <div className="text-token-text-secondary ml-3 mr-2 py-2 text-sm" role="note">
              {localize('com_nav_balance')}:{' '}
              {new Intl.NumberFormat().format(Math.round(balanceQuery.data.tokenCredits))}
            </div>
            <DropdownMenuSeparator />
          </>
        )}
        {/* BKL: 내 파일(업로드 파일 라이브러리) / 보관된 채팅 / 로그아웃 노출. 도움말 / 설정은 제거. */}
        <Menu.MenuItem
          onClick={() => setIsFilesOpen(true)}
          className="select-item text-sm"
          aria-label={localize('com_nav_my_files')}
        >
          <FileText className="icon-md" aria-hidden="true" />
          {localize('com_nav_my_files')}
        </Menu.MenuItem>
        <Menu.MenuItem
          onClick={() => setIsArchiveOpen(true)}
          className="select-item text-sm"
          aria-label={localize('com_nav_archived_chats')}
        >
          <Archive className="icon-md" aria-hidden="true" />
          {localize('com_nav_archived_chats')}
        </Menu.MenuItem>
        <DropdownMenuSeparator />
        <Menu.MenuItem onClick={() => logout()} className="select-item text-sm">
          <LogOut className="icon-md" aria-hidden="true" />
          {localize('com_nav_log_out')}
        </Menu.MenuItem>
      </Menu.Menu>
      <OGDialog open={isArchiveOpen} onOpenChange={setIsArchiveOpen}>
        <OGDialogTemplate
          title={localize('com_nav_archived_chats')}
          className="max-w-[1000px]"
          showCancelButton={false}
          main={<ArchivedChatsTable onOpenChange={setIsArchiveOpen} />}
        />
      </OGDialog>
      {isFilesOpen && <MyFilesModal open={isFilesOpen} onOpenChange={setIsFilesOpen} />}
    </Menu.MenuProvider>
  );
}

export default memo(AccountSettings);
