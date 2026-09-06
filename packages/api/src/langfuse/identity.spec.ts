import { buildLangfuseTraceMetadata, resolveLangfuseTraceUserId } from './identity';

const user = {
  id: 'user-1',
  email: 'alice@example.com',
  username: 'alice',
  name: '  Alice  ',
  role: 'ADMIN',
  provider: 'openid',
  openidId: 'oidc-sub-1',
};

describe('resolveLangfuseTraceUserId', () => {
  it('keeps the SDK default when no field is configured', () => {
    expect(resolveLangfuseTraceUserId(undefined, user)).toBeUndefined();
    expect(resolveLangfuseTraceUserId({}, user)).toBeUndefined();
  });

  it('keeps the SDK default when the internal id is selected explicitly', () => {
    expect(resolveLangfuseTraceUserId({ userIdField: 'id' }, user)).toBeUndefined();
  });

  it('selects the configured user field, trimmed', () => {
    expect(resolveLangfuseTraceUserId({ userIdField: 'email' }, user)).toBe('alice@example.com');
    expect(resolveLangfuseTraceUserId({ userIdField: 'name' }, user)).toBe('Alice');
    expect(resolveLangfuseTraceUserId({ userIdField: 'openidId' }, user)).toBe('oidc-sub-1');
  });

  it('falls back to the internal id when the user lacks the configured field', () => {
    expect(resolveLangfuseTraceUserId({ userIdField: 'samlId' }, user)).toBeUndefined();
    expect(resolveLangfuseTraceUserId({ userIdField: 'email' }, { id: 'user-2' })).toBeUndefined();
    expect(
      resolveLangfuseTraceUserId({ userIdField: 'email' }, { id: 'user-2', email: '   ' }),
    ).toBeUndefined();
    expect(resolveLangfuseTraceUserId({ userIdField: 'email' }, undefined)).toBeUndefined();
  });
});

describe('buildLangfuseTraceMetadata', () => {
  const context = {
    conversationId: 'convo-1',
    endpoint: 'agents',
    endpointType: undefined,
    provider: 'openAI',
    model: 'gpt-5',
    modelLabel: '',
    spec: 'support-bot',
  };

  it('exports nothing unless a field is allowlisted', () => {
    expect(buildLangfuseTraceMetadata({ trace: undefined, user, context })).toBeUndefined();
    expect(buildLangfuseTraceMetadata({ trace: {}, user, context })).toBeUndefined();
    expect(
      buildLangfuseTraceMetadata({
        trace: { userMetadataFields: [], conversationMetadataFields: [] },
        user,
        context,
      }),
    ).toBeUndefined();
  });

  it('exports only the allowlisted user fields under librechat.user', () => {
    expect(
      buildLangfuseTraceMetadata({
        trace: { userMetadataFields: ['email', 'role', 'email'] },
        user,
        context,
      }),
    ).toEqual({
      'librechat.user.email': 'alice@example.com',
      'librechat.user.role': 'ADMIN',
    });
  });

  it('exports only the allowlisted request fields under their trace keys', () => {
    expect(
      buildLangfuseTraceMetadata({
        trace: {
          conversationMetadataFields: [
            'conversationId',
            'endpoint',
            'endpointType',
            'provider',
            'model',
            'modelLabel',
            'spec',
          ],
        },
        user,
        context,
      }),
    ).toEqual({
      'librechat.conversation.id': 'convo-1',
      'librechat.endpoint': 'agents',
      'librechat.provider': 'openAI',
      'librechat.model': 'gpt-5',
      'librechat.spec': 'support-bot',
    });
  });

  it('skips blank and missing values instead of exporting empty keys', () => {
    expect(
      buildLangfuseTraceMetadata({
        trace: {
          userMetadataFields: ['samlId', 'name'],
          conversationMetadataFields: ['modelLabel'],
        },
        user: { ...user, name: ' ' },
        context,
      }),
    ).toBeUndefined();
    expect(
      buildLangfuseTraceMetadata({
        trace: { userMetadataFields: ['email'], conversationMetadataFields: ['model'] },
        user: undefined,
        context: undefined,
      }),
    ).toBeUndefined();
  });
});
