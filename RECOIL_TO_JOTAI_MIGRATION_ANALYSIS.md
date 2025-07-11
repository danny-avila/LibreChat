# Recoil to Jotai Migration Analysis

## Summary

Found **161 files** in the client/src directory that import from 'recoil' (excluding test files and the store directory).

## Recoil Hook Usage Statistics

Based on analysis of the codebase:

1. **useRecoilValue** - 57 unique imports (most common)
2. **useRecoilState** - 41 unique imports 
3. **useSetRecoilState** - 21 unique imports
4. **useRecoilCallback** - 4 unique imports
5. **useResetRecoilState** - Used in several files
6. **useRecoilValueLoadable** - Not found in usage
7. **useRecoilStateLoadable** - Not found in usage

## Files by Directory

### Components (97 files)

#### Artifacts (4 files)
- `components/Artifacts/Artifact.tsx`
- `components/Artifacts/ArtifactButton.tsx`
- `components/Artifacts/Artifacts.tsx`
- `components/Artifacts/Thinking.tsx`

#### Audio (2 files)
- `components/Audio/TTS.tsx`
- `components/Audio/Voices.tsx`

#### Banners (1 file)
- `components/Banners/Banner.tsx`

#### Chat (26 files)
- `components/Chat/ChatView.tsx`
- `components/Chat/ExportAndShareMenu.tsx`
- `components/Chat/Presentation.tsx`
- `components/Chat/TemporaryChat.tsx`
- **Input** (11 files)
  - `components/Chat/Input/AddedConvo.tsx`
  - `components/Chat/Input/BadgeRow.tsx`
  - `components/Chat/Input/ChatForm.tsx`
  - `components/Chat/Input/HeaderOptions.tsx`
  - `components/Chat/Input/Mention.tsx`
  - `components/Chat/Input/PopoverButtons.tsx`
  - `components/Chat/Input/PromptsCommand.tsx`
  - `components/Chat/Input/StreamAudio.tsx`
  - `components/Chat/Input/TextareaHeader.tsx`
  - `components/Chat/Input/Files/AttachFileMenu.tsx`
  - `components/Chat/Input/Files/FileFormChat.tsx`
  - `components/Chat/Input/Files/Table/DataTable.tsx`
- **Menus** (3 files)
  - `components/Chat/Menus/BookmarkMenu.tsx`
  - `components/Chat/Menus/Presets/EditPresetDialog.tsx`
  - `components/Chat/Menus/Presets/PresetItems.tsx`
- **Messages** (15 files)
  - `components/Chat/Messages/Fork.tsx`
  - `components/Chat/Messages/HoverButtons.tsx`
  - `components/Chat/Messages/Message.tsx`
  - `components/Chat/Messages/MessageAudio.tsx`
  - `components/Chat/Messages/MessageParts.tsx`
  - `components/Chat/Messages/MessagesView.tsx`
  - `components/Chat/Messages/MultiMessage.tsx`
  - `components/Chat/Messages/SearchButtons.tsx`
  - `components/Chat/Messages/SearchMessage.tsx`
  - `components/Chat/Messages/ui/MessageRender.tsx`
  - **Content** (9 files)
    - `components/Chat/Messages/Content/CodeAnalyze.tsx`
    - `components/Chat/Messages/Content/ContentParts.tsx`
    - `components/Chat/Messages/Content/EditMessage.tsx`
    - `components/Chat/Messages/Content/Markdown.tsx`
    - `components/Chat/Messages/Content/MessageContent.tsx`
    - `components/Chat/Messages/Content/SearchContent.tsx`
    - `components/Chat/Messages/Content/Parts/EditTextPart.tsx`
    - `components/Chat/Messages/Content/Parts/ExecuteCode.tsx`
    - `components/Chat/Messages/Content/Parts/Text.tsx`

#### Conversations (1 file)
- `components/Conversations/Convo.tsx`

#### Endpoints (3 files)
- `components/Endpoints/AlternativeSettings.tsx`
- `components/Endpoints/EndpointSettings.tsx`
- `components/Endpoints/Settings/Plugins.tsx`

#### Files (1 file)
- `components/Files/FileList/DataTableFile.tsx`

#### Input (1 file)
- `components/Input/ModelSelect/PluginsByIndex.tsx`

#### Messages (1 file)
- `components/Messages/ContentRender.tsx`

#### Nav (34 files)
- `components/Nav/AccountSettings.tsx`
- `components/Nav/MobileNav.tsx`
- `components/Nav/Nav.tsx`
- `components/Nav/NewChat.tsx`
- `components/Nav/SearchBar.tsx`
- `components/Nav/Bookmarks/BookmarkNav.tsx`
- **SettingsTabs** (28 files)
  - `components/Nav/SettingsTabs/ToggleSwitch.tsx`
  - **Account** (4 files)
    - `components/Nav/SettingsTabs/Account/Avatar.tsx`
    - `components/Nav/SettingsTabs/Account/BackupCodesItem.tsx`
    - `components/Nav/SettingsTabs/Account/DisplayUsernameMessages.tsx`
    - `components/Nav/SettingsTabs/Account/TwoFactorAuthentication.tsx`
  - **Chat** (5 files)
    - `components/Nav/SettingsTabs/Chat/ChatDirection.tsx`
    - `components/Nav/SettingsTabs/Chat/FontSizeSelector.tsx`
    - `components/Nav/SettingsTabs/Chat/ForkSettings.tsx`
    - `components/Nav/SettingsTabs/Chat/SaveBadgesState.tsx`
    - `components/Nav/SettingsTabs/Chat/ShowThinking.tsx`
  - **Commands** (3 files)
    - `components/Nav/SettingsTabs/Commands/AtCommandSwitch.tsx`
    - `components/Nav/SettingsTabs/Commands/PlusCommandSwitch.tsx`
    - `components/Nav/SettingsTabs/Commands/SlashCommandSwitch.tsx`
  - **General** (1 file)
    - `components/Nav/SettingsTabs/General/General.tsx`
  - **Speech** (14 files)
    - `components/Nav/SettingsTabs/Speech/ConversationModeSwitch.tsx`
    - `components/Nav/SettingsTabs/Speech/Speech.tsx`
    - **STT** (6 files)
      - `components/Nav/SettingsTabs/Speech/STT/AutoSendTextSelector.tsx`
      - `components/Nav/SettingsTabs/Speech/STT/AutoTranscribeAudioSwitch.tsx`
      - `components/Nav/SettingsTabs/Speech/STT/DecibelSelector.tsx`
      - `components/Nav/SettingsTabs/Speech/STT/EngineSTTDropdown.tsx`
      - `components/Nav/SettingsTabs/Speech/STT/LanguageSTTDropdown.tsx`
      - `components/Nav/SettingsTabs/Speech/STT/SpeechToTextSwitch.tsx`
    - **TTS** (6 files)
      - `components/Nav/SettingsTabs/Speech/TTS/AutomaticPlaybackSwitch.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/CacheTTSSwitch.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/CloudBrowserVoicesSwitch.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/EngineTTSDropdown.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/PlaybackRate.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/TextToSpeechSwitch.tsx`
      - `components/Nav/SettingsTabs/Speech/TTS/VoiceDropdown.tsx`

#### Prompts (7 files)
- `components/Prompts/AdvancedSwitch.tsx`
- `components/Prompts/ManagePrompts.tsx`
- `components/Prompts/PromptEditor.tsx`
- `components/Prompts/PromptForm.tsx`
- `components/Prompts/Groups/AlwaysMakeProd.tsx`
- `components/Prompts/Groups/AutoSendPrompt.tsx`
- `components/Prompts/Groups/FilterPrompts.tsx`

#### Share (2 files)
- `components/Share/Message.tsx`
- `components/Share/MultiMessage.tsx`

#### SidePanel (2 files)
- `components/SidePanel/Files/PanelTable.tsx`
- `components/SidePanel/SidePanelGroup.tsx`

#### UI (2 files)
- `components/ui/DataTable.tsx`
- `components/ui/TextareaAutosize.tsx`

### Hooks (47 files)

#### Artifacts (1 file)
- `hooks/Artifacts/useArtifacts.ts`

#### Audio (3 files)
- `hooks/Audio/usePauseGlobalAudio.ts`
- `hooks/Audio/useTTSBrowser.ts`
- `hooks/Audio/useTTSExternal.ts`

#### Chat (4 files)
- `hooks/Chat/useAddedHelpers.ts`
- `hooks/Chat/useChatFunctions.ts`
- `hooks/Chat/useChatHelpers.ts`
- `hooks/Chat/useIdChangeEffect.ts`

#### Config (4 files)
- `hooks/Config/useAppStartup.ts`
- `hooks/Config/useClearStates.ts`
- `hooks/Config/useConfigOverride.ts`
- `hooks/Config/useSpeechSettingsInit.ts`

#### Conversations (8 files)
- `hooks/Conversations/useBookmarkSuccess.ts`
- `hooks/Conversations/useDebouncedInput.ts`
- `hooks/Conversations/useGenerateConvo.ts`
- `hooks/Conversations/useNavigateToConvo.tsx`
- `hooks/Conversations/usePresetIndexOptions.ts`
- `hooks/Conversations/usePresets.ts`
- `hooks/Conversations/useSearchEnabled.ts`
- `hooks/Conversations/useSetIndexOptions.ts`

#### Files (1 file)
- `hooks/Files/useDragHelpers.ts`

#### Input (11 files)
- `hooks/Input/useAutoSave.ts`
- `hooks/Input/useGetAudioSettings.ts`
- `hooks/Input/useHandleKeyUp.ts`
- `hooks/Input/useQueryParams.ts`
- `hooks/Input/useSelectMention.ts`
- `hooks/Input/useSpeechToTextBrowser.ts`
- `hooks/Input/useSpeechToTextExternal.ts`
- `hooks/Input/useTextarea.ts`
- `hooks/Input/useTextToSpeech.ts`
- `hooks/Input/useTextToSpeechBrowser.ts`
- `hooks/Input/useTextToSpeechExternal.ts`

#### Messages (6 files)
- `hooks/Messages/useAttachments.ts`
- `hooks/Messages/useBuildMessageTree.ts`
- `hooks/Messages/useMessageActions.tsx`
- `hooks/Messages/useMessageProcess.tsx`
- `hooks/Messages/useMessageScrolling.ts`
- `hooks/Messages/useSubmitMessage.ts`

#### Plugins (3 files)
- `hooks/Plugins/useMCPSelect.ts`
- `hooks/Plugins/usePluginInstall.ts`
- `hooks/Plugins/useToolToggle.ts`

#### Prompts (1 file)
- `hooks/Prompts/usePromptGroupsNav.ts`

#### SSE (4 files)
- `hooks/SSE/useAttachmentHandler.ts`
- `hooks/SSE/useEventHandlers.ts`
- `hooks/SSE/useSSE.ts`
- `hooks/SSE/useStepHandler.ts`

#### Root level hooks (5 files)
- `hooks/AuthContext.tsx`
- `hooks/ThemeContext.tsx`
- `hooks/useChatBadges.ts`
- `hooks/useLocalize.ts`
- `hooks/useNewConvo.ts`
- `hooks/useToast.ts`

### Data Provider (6 files)
- `data-provider/Auth/mutations.ts`
- `data-provider/Auth/queries.ts`
- `data-provider/Endpoints/queries.ts`
- `data-provider/Files/queries.ts`
- `data-provider/Misc/queries.ts`
- `data-provider/prompts.ts`

### Other (6 files)
- `App.jsx`
- `common/types.ts`
- `Providers/BadgeRowContext.tsx`
- `routes/ChatRoute.tsx`
- `routes/Layouts/DashBreadcrumb.tsx`
- `routes/Layouts/Login.tsx`
- `routes/Search.tsx`

## Most Common Recoil Atoms Used

Based on the grep analysis, the most frequently accessed atoms are:
1. `store.queriesEnabled` - Used for controlling query execution
2. `store.availableTools` - Tool availability state
3. `store.voice` - Voice settings
4. `store.fontSize` - Font size preference
5. `store.promptsCategory`, `store.promptsName`, `store.promptsPageSize` - Prompt filtering
6. `store.speechToText` - Speech to text settings
7. `store.search` - Search state
8. `store.playbackRate` - Audio playback settings
9. `store.maximizeChatSpace` - UI layout state
10. `store.user` - User state

## Migration Complexity

### High Complexity (Files using multiple hooks or complex patterns)
- Files using `useRecoilCallback` (4 files)
- Files using combinations of multiple hooks
- Files in `hooks/` directory that coordinate state

### Medium Complexity
- Files using `useRecoilState` (41 files)
- Files using `useSetRecoilState` and `useRecoilValue` together

### Low Complexity
- Files only using `useRecoilValue` (57 files)
- Simple state reads without updates