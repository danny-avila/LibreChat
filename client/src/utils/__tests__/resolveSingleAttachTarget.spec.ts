import { EToolResources } from 'librechat-data-provider';
import { resolveSingleAttachTarget, type AttachTargetContext } from '../files';

const ctx = (over: Partial<AttachTargetContext> = {}): AttachTargetContext => ({
  fileSearchEnabled: true,
  codeEnabled: true,
  contextEnabled: true,
  fileSearchAllowedByAgent: true,
  codeAllowedByAgent: true,
  ...over,
});

describe('resolveSingleAttachTarget', () => {
  it('keeps the menu when the mode is unset or "menu"', () => {
    expect(resolveSingleAttachTarget(undefined, ctx())).toBeNull();
    expect(resolveSingleAttachTarget({}, ctx())).toBeNull();
    expect(resolveSingleAttachTarget({ attachFileMode: 'menu' }, ctx())).toBeNull();
    expect(
      resolveSingleAttachTarget(
        { attachFileMode: 'menu', attachFileDefaultTarget: 'execute_code' },
        ctx(),
      ),
    ).toBeNull();
  });

  it('defaults the single target to the code environment', () => {
    expect(resolveSingleAttachTarget({ attachFileMode: 'single' }, ctx())).toEqual({
      target: EToolResources.execute_code,
    });
  });

  it('falls back to the menu when the code environment is not available to the agent', () => {
    expect(
      resolveSingleAttachTarget({ attachFileMode: 'single' }, ctx({ codeEnabled: false })),
    ).toBeNull();
    expect(
      resolveSingleAttachTarget({ attachFileMode: 'single' }, ctx({ codeAllowedByAgent: false })),
    ).toBeNull();
  });

  it('maps the provider target to the undefined tool resource', () => {
    expect(
      resolveSingleAttachTarget(
        { attachFileMode: 'single', attachFileDefaultTarget: 'provider' },
        ctx({ codeEnabled: false, contextEnabled: false, fileSearchEnabled: false }),
      ),
    ).toEqual({ target: undefined });
  });

  it('honors the context and file search targets only when they are available', () => {
    const single = (attachFileDefaultTarget: 'context' | 'file_search') => ({
      attachFileMode: 'single' as const,
      attachFileDefaultTarget,
    });
    expect(resolveSingleAttachTarget(single('context'), ctx())).toEqual({
      target: EToolResources.context,
    });
    expect(resolveSingleAttachTarget(single('context'), ctx({ contextEnabled: false }))).toBeNull();
    expect(resolveSingleAttachTarget(single('file_search'), ctx())).toEqual({
      target: EToolResources.file_search,
    });
    expect(
      resolveSingleAttachTarget(single('file_search'), ctx({ fileSearchAllowedByAgent: false })),
    ).toBeNull();
    expect(
      resolveSingleAttachTarget(single('file_search'), ctx({ fileSearchEnabled: false })),
    ).toBeNull();
  });
});
