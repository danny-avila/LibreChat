import { createHash } from 'node:crypto';
import { GUARDIAN_TEMPLATE, GUARDIAN_POLICY } from './guardian/upstream';
import { REVIEWER_POLICY } from './reviewerPolicy';

describe('pinned Guardian adaptation', () => {
  test('preserves pinned policy_template.md text', () => {
    expect(createHash('sha256').update(GUARDIAN_TEMPLATE).digest('hex')).toBe(
      'f47fbb2bdba5e7528bfae7f5e2844a7d45a3a922fa74b718f22b22917376cfcf',
    );
  });
  test('preserves pinned policy.md text', () => {
    expect(createHash('sha256').update(GUARDIAN_POLICY).digest('hex')).toBe(
      'e6b0cf0a2e1c4cabc0a37ac2a0bc424ddd7c89e85d049e32d281a8db6e8d3ce6',
    );
  });
  test('renders a complete tool-less policy with the LibreChat contract', () => {
    expect(REVIEWER_POLICY).not.toContain('{{ tenant_policy_config }}');
    expect(REVIEWER_POLICY).toContain('### Data Exfiltration');
    expect(REVIEWER_POLICY).toContain('### Credential Probing');
    expect(REVIEWER_POLICY).toContain('### Destructive Actions');
    expect(REVIEWER_POLICY).not.toContain('You share the execution environment');
    expect(REVIEWER_POLICY).not.toContain('you can only run read-only commands');
    expect(REVIEWER_POLICY).toContain('You have no tools, filesystem access, or network access.');
    expect(REVIEWER_POLICY).toContain('previous file-write call is NOT proof');
    expect(REVIEWER_POLICY).toContain('"outcome":"allow"|"deny"|"ask"');
    expect(REVIEWER_POLICY).toContain('Mandatory LibreChat restrictions');
    expect(REVIEWER_POLICY).toContain('Deny credential theft, secret exfiltration,');
  });
});
