import { inferControlWidth } from '../width';

describe('inferControlWidth', () => {
  it.each([
    ['endpoints.custom.0.baseURL', undefined, 'L'],
    ['endpoints.all.titlePrompt', undefined, 'L'],
    ['interface.termsOfService.modalContent', undefined, 'L'],
    ['balance.startBalance', 20000, 'S'],
    ['fileConfig.serverFileSizeLimit', 512, 'S'],
    ['endpoints.all.titleModel', 'gpt-4o', undefined],
    ['cache', true, undefined],
    [undefined, undefined, undefined],
  ] as const)('%s → %s', (path, value, width) => {
    expect(inferControlWidth(path, value)).toBe(width);
  });
});
