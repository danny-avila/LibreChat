import React from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { PermissionTypes, Permissions } from 'librechat-data-provider';
import { useLocalize, useHasAccess } from '~/hooks';
import { Button } from '~/components/ui';

const CreatePromptButton: React.FC<{ isChatRoute: boolean }> = ({ isChatRoute }) => {
  const navigate = useNavigate();
  const localize = useLocalize();
  const hasCreateAccess = useHasAccess({
    permissionType: PermissionTypes.PROMPTS,
    permission: Permissions.CREATE,
  });

  return (
    <>
      {hasCreateAccess && (
        <div className="flex w-full justify-end">
          <Button
            variant="outline"
            className={`w-full bg-transparent ${isChatRoute ? '' : 'mx-2'}`}
            onClick={() => navigate('/d/prompts/new')}
          >
            <Plus className="size-4" aria-hidden />
            {localize('com_ui_create_prompt')}
          </Button>
        </div>
      )}
    </>
  );
};

export default CreatePromptButton;
