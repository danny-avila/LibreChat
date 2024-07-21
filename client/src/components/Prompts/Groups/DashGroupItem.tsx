import { useState, useRef, useMemo } from 'react';
import { MenuIcon, EarthIcon } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { SystemRoles, type TPromptGroup } from 'librechat-data-provider';
import { useDeletePromptGroup, useUpdatePromptGroup } from '~/data-provider';
import {
  Input,
  Label,
  Button,
  Dialog,
  DropdownMenu,
  DialogTrigger,
  DropdownMenuGroup,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '~/components/ui';
import CategoryIcon from '~/components/Prompts/Groups/CategoryIcon';
import DialogTemplate from '~/components/ui/DialogTemplate';
import { RenameButton } from '~/components/Conversations';
import { useLocalize, useAuthContext } from '~/hooks';
import { TrashIcon } from '~/components/svg';
import { cn } from '~/utils/';

export default function DashGroupItem({
  group,
  instanceProjectId,
}: {
  group: TPromptGroup;
  instanceProjectId?: string;
}) {
  const params = useParams();
  const navigate = useNavigate();
  const localize = useLocalize();

  const { user } = useAuthContext();
  const blurTimeoutRef = useRef<NodeJS.Timeout>();
  const [nameEditFlag, setNameEditFlag] = useState(false);
  const [nameInputField, setNameInputField] = useState(group.name);
  const isOwner = useMemo(() => user?.id === group?.author, [user, group]);
  const groupIsGlobal = useMemo(
    () => instanceProjectId && group?.projectIds?.includes(instanceProjectId),
    [group, instanceProjectId],
  );

  const updateGroup = useUpdatePromptGroup({
    onMutate: () => {
      clearTimeout(blurTimeoutRef.current);
      setNameEditFlag(false);
    },
  });
  const deletePromptGroupMutation = useDeletePromptGroup({
    onSuccess: (response, variables) => {
      if (variables.id === group._id) {
        navigate('/d/prompts');
      }
    },
  });

  const cancelRename = () => {
    setNameEditFlag(false);
  };

  const saveRename = () => {
    updateGroup.mutate({ payload: { name: nameInputField }, id: group?._id || '' });
  };

  const handleBlur = () => {
    blurTimeoutRef.current = setTimeout(() => {
      cancelRename();
    }, 100);
  };

  return (
    <div
      className={cn(
        'w-100 mx-2 my-3 flex cursor-pointer flex-row rounded-md border-0 bg-white p-4 transition-all duration-300 ease-in-out hover:bg-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600',
        params.promptId === group._id && 'bg-gray-100/50 dark:bg-gray-600 ',
      )}
      onClick={() => {
        if (nameEditFlag) {
          return;
        }
        navigate(`/d/prompts/${group._id}`, { replace: true });
      }}
    >
      <div className="flex w-full flex-row items-center justify-start truncate">
        {/* <Checkbox /> */}
        <div className="relative flex w-full cursor-pointer flex-col gap-1 text-start align-top">
          {nameEditFlag ? (
            <>
              <div className="flex w-full gap-2">
                <Input
                  defaultValue={nameInputField}
                  className="w-full"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  onChange={(e) => {
                    setNameInputField(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      cancelRename();
                    } else if (e.key === 'Enter') {
                      saveRename();
                    }
                  }}
                  onBlur={handleBlur}
                />
                <Button
                  variant="subtle"
                  className="w-min bg-green-500 text-white hover:bg-green-600 dark:bg-green-400 dark:hover:bg-green-500"
                  onClick={(e) => {
                    e.stopPropagation();
                    saveRename();
                  }}
                >
                  {localize('com_ui_save')}
                </Button>
              </div>
              <div className="break-word line-clamp-3 text-balance text-sm text-gray-600 dark:text-gray-400">
                {localize('com_ui_renaming_var', group.name)}
              </div>
            </>
          ) : (
            <>
              <div className="flex w-full justify-between">
                <div className="flex flex-row gap-2">
                  <CategoryIcon category={group.category ?? ''} className="icon-md" />
                  <h3 className="break-word text-balance text-sm font-semibold text-gray-800 dark:text-gray-200">
                    {group.name}
                  </h3>
                </div>
                <div className="flex flex-row items-center gap-1">
                  {groupIsGlobal && <EarthIcon className="icon-md text-green-400" />}
                  {(isOwner || user?.role === SystemRoles.ADMIN) && (
                    <>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            className="h-7 w-7 p-0 hover:bg-gray-200 dark:bg-gray-800/50 dark:text-gray-400 dark:hover:border-gray-400 dark:focus:border-gray-500"
                          >
                            <MenuIcon className="icon-md dark:text-gray-300" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="mt-2 w-36 rounded-lg" collisionPadding={2}>
                          <DropdownMenuGroup>
                            <RenameButton
                              renaming={false}
                              renameHandler={(e) => {
                                e.stopPropagation();
                                setNameEditFlag(true);
                              }}
                              appendLabel={true}
                              className={cn('m-0 w-full p-2')}
                            />
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Dialog>
                        <DialogTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'h-7 w-7 p-0 hover:bg-gray-200  dark:bg-gray-800/50 dark:text-gray-400 dark:hover:border-gray-400 dark:focus:border-gray-500',
                            )}
                            onClick={(e) => {
                              e.stopPropagation();
                            }}
                          >
                            <TrashIcon className="icon-md text-gray-600 dark:text-gray-300" />
                          </Button>
                        </DialogTrigger>
                        <DialogTemplate
                          showCloseButton={false}
                          title={localize('com_ui_delete_prompt')}
                          className="max-w-[450px]"
                          main={
                            <>
                              <div className="flex w-full flex-col items-center gap-2">
                                <div className="grid w-full items-center gap-2">
                                  <Label
                                    htmlFor="chatGptLabel"
                                    className="text-left text-sm font-medium"
                                  >
                                    {localize('com_ui_delete_confirm')}{' '}
                                    <strong>{group.name}</strong>
                                  </Label>
                                </div>
                              </div>
                            </>
                          }
                          selection={{
                            selectHandler: () => {
                              deletePromptGroupMutation.mutate({ id: group?._id || '' });
                            },
                            selectClasses:
                              'bg-red-600 dark:bg-red-600 hover:bg-red-700 dark:hover:bg-red-800 text-white',
                            selectText: localize('com_ui_delete'),
                          }}
                        />
                      </Dialog>
                    </>
                  )}
                </div>
              </div>
              <div className="ellipsis text-balance text-sm text-gray-600 dark:text-gray-400">
                {group.oneliner ? group.oneliner : group?.productionPrompt?.prompt ?? ''}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
