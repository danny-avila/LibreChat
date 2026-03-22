# Capability: openclaw-frontend-components

## Requirement: ModelSwitcher Visibility
`OpenClawModelSwitcher` SHALL render null when the conversation endpoint is not `openclaw`.

#### Scenario: Non-openclaw endpoint
- GIVEN a conversation with `endpoint !== 'openclaw'`
- WHEN the component renders
- THEN nothing is rendered (null)

## Requirement: ModelSwitcher Current Model Display
The switcher SHALL display the current model name from `conversation.model` when loaded.

## Requirement: ModelSwitcher Calls Mutation
When a menu item is clicked with a different model, `useSwitchOpenClawModel.mutate` SHALL be called with `{ model, sessionKey }`.

## Requirement: ThinkingLevelSelector Options
`ThinkingLevelSelector` SHALL render options for all 6 levels: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`.

## Requirement: OpenClawSkillsPanel Render
`OpenClawSkillsPanel` SHALL render a list of skill names and descriptions when skills data is available.
