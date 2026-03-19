const fs = require('fs');
const path = require('path');
const { ResourceType } = require('librechat-data-provider');

/**
 * Maps each ResourceType to the pattern that must appear in deleteUserController's
 * source code to prove it is handled during user deletion.
 *
 * When a new ResourceType is added, this test will fail until a corresponding
 * cleanup entry is added here AND the actual cleanup logic is implemented.
 */
const HANDLED_RESOURCE_TYPES = {
  [ResourceType.AGENT]: 'deleteUserAgents',
  [ResourceType.REMOTE_AGENT]: 'deleteUserAgents',
  [ResourceType.PROMPTGROUP]: 'deleteUserPrompts',
  [ResourceType.MCPSERVER]: 'deleteUserMcpServers',
};

describe('deleteUserController - resource type coverage guard', () => {
  const controllerSource = fs.readFileSync(
    path.resolve(__dirname, '../UserController.js'),
    'utf-8',
  );

  test('every ResourceType must have a documented cleanup handler', () => {
    const allTypes = Object.values(ResourceType);
    const handledTypes = Object.keys(HANDLED_RESOURCE_TYPES);
    const unhandledTypes = allTypes.filter((t) => !handledTypes.includes(t));

    expect(unhandledTypes).toEqual([]);
  });

  test('every cleanup handler referenced in HANDLED_RESOURCE_TYPES must appear in the controller source', () => {
    const uniqueHandlers = [...new Set(Object.values(HANDLED_RESOURCE_TYPES))];

    for (const handler of uniqueHandlers) {
      expect(controllerSource).toContain(handler);
    }
  });
});
