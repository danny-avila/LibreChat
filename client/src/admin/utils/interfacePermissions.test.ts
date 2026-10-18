import type { TInterfaceConfig } from 'librechat-data-provider';
import { isInterfacePermissionPath, stripInterfacePermissionFields } from './interfacePermissions';

describe('isInterfacePermissionPath', () => {
  it('blocks bare permission fields and permission sub-keys', () => {
    expect(isInterfacePermissionPath('interface.prompts')).toBe(true);
    expect(isInterfacePermissionPath('interface.mcpServers')).toBe(true);
    expect(isInterfacePermissionPath('interface.mcpServers.use')).toBe(true);
  });

  it('allows UI sub-keys and non-permission fields', () => {
    expect(isInterfacePermissionPath('interface.mcpServers.placeholder')).toBe(false);
    expect(isInterfacePermissionPath('interface.endpointsMenu')).toBe(false);
  });

  it('allows the bare runtime toggle for schedules but blocks its permission sub-keys', () => {
    expect(isInterfacePermissionPath('interface.schedules')).toBe(false);
    expect(isInterfacePermissionPath('interface.schedules.maxPerUser')).toBe(false);
    expect(isInterfacePermissionPath('interface.schedules.use')).toBe(true);
    expect(isInterfacePermissionPath('interface.schedules.create')).toBe(true);
  });
});

describe('stripInterfacePermissionFields', () => {
  it('drops boolean permission fields', () => {
    expect(stripInterfacePermissionFields({ prompts: true, bookmarks: false })).toEqual({});
  });

  it('preserves the boolean runtime toggle for schedules', () => {
    expect(stripInterfacePermissionFields({ schedules: false })).toEqual({ schedules: false });
  });

  it('strips permission sub-keys from the schedules object form', () => {
    const input = {
      schedules: { use: true, create: true, maxPerUser: 2 },
    } as Partial<TInterfaceConfig>;
    expect(stripInterfacePermissionFields(input)).toEqual({ schedules: { maxPerUser: 2 } });
  });

  it('collapses a disabled schedules object to false', () => {
    const input = { schedules: { use: false, maxPerUser: 2 } } as Partial<TInterfaceConfig>;
    expect(stripInterfacePermissionFields(input)).toEqual({ schedules: false });
  });
});
