jest.mock('@librechat/data-schemas', () => ({ createMethods: jest.fn(() => ({})) }));
jest.mock('@librechat/api', () => ({
  matchModelName: jest.fn(),
  findMatchingPattern: jest.fn(),
  isDeploymentSkillId: jest.fn(),
}));
jest.mock('~/cache/getLogStores', () => jest.fn());
jest.mock('~/server/services/Config', () => ({ getAppConfig: jest.fn() }));

const { createMethods } = require('@librechat/data-schemas');
const { getAppConfig } = require('~/server/services/Config');
require('./index');
const { getMCPAppMessageBudget } = createMethods.mock.calls[0][1];

describe('message App budget configuration', () => {
  it('does not read config during method-adapter construction', () => {
    expect(getAppConfig).not.toHaveBeenCalled();
  });

  it('resolves the base deployment setting without user or role overrides', async () => {
    getAppConfig.mockResolvedValue({
      mcpAppSandbox: { maxPersistedMessageBytes: 2 * 1024 * 1024 },
    });
    expect(await getMCPAppMessageBudget()).toBe(2 * 1024 * 1024);
    expect(getAppConfig).toHaveBeenLastCalledWith();
  });

  it('leaves missing limits to the storage default and propagates config errors', async () => {
    getAppConfig.mockResolvedValue({});
    expect(await getMCPAppMessageBudget()).toBeUndefined();
    getAppConfig.mockRejectedValue(new Error('configuration unavailable'));
    await expect(getMCPAppMessageBudget()).rejects.toThrow('configuration unavailable');
  });
});
