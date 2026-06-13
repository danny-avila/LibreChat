/* `CodeEnvRef` is a plain typed struct (no helpers, no resolvers).
 * Behavioral coverage lives at consumer sites — `processCodeOutput`
 * (write), `primeFiles` (read+reupload), `primeSkillFiles` (read+write),
 * agents `ToolNode` (forward to codeapi). This file just pins the
 * shape so a future refactor can't silently widen or narrow the
 * fields without surfacing here. */
import { CODE_ENV_KINDS } from './codeEnvRef';
import type { CodeEnvKind, CodeEnvRef } from './codeEnvRef';

describe('CodeEnvRef', () => {
  it('accepts the canonical shape for kind: skill', () => {
    const ref: CodeEnvRef = {
      kind: 'skill',
      id: 'skill_123',
      storage_session_id: 'sess_abc',
      file_id: 'file_xyz',
      version: 7,
    };
    expect(ref.kind).toBe('skill');
    expect(ref.version).toBe(7);
  });

  it('accepts the canonical shape for kind: user', () => {
    const ref: CodeEnvRef = {
      kind: 'user',
      id: 'user_456',
      storage_session_id: 'sess_def',
      file_id: 'file_uvw',
    };
    expect(ref.kind).toBe('user');
    /* `version` is statically absent on the user variant of the
     * discriminated union — the property doesn't exist on the type, so
     * accessing it would be a compile error. Probe at runtime via an
     * `unknown` cast to assert the absence at runtime as well. */
    expect((ref as unknown as Record<string, unknown>).version).toBeUndefined();
  });

  it('accepts the canonical shape for kind: agent', () => {
    const ref: CodeEnvRef = {
      kind: 'agent',
      id: 'agent_789',
      storage_session_id: 'sess_ghi',
      file_id: 'file_rst',
    };
    expect(ref.kind).toBe('agent');
  });

  it('CODE_ENV_KINDS pins the closed set of kinds', () => {
    /* Adding a new kind requires updating the runtime tuple AND
     * surfacing it in `resolveSessionKey`'s exhaustive switch. The
     * `as const` shape makes this catch-able by the type system. */
    const kinds: CodeEnvKind[] = [...CODE_ENV_KINDS];
    expect(kinds).toEqual(['skill', 'agent', 'user']);
  });
});
