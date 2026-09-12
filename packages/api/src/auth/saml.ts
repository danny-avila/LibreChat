export const TRANSIENT_SAML_NAME_ID_FORMAT = 'urn:oasis:names:tc:SAML:2.0:nameid-format:transient';

export type SamlSubjectError = 'missing_name_id' | 'transient_name_id' | 'issuer_mismatch';

export interface SamlSubjectProfile {
  nameID?: string;
  nameIDFormat?: string;
  issuer?: string;
}

export type SamlSubjectResolution =
  | { nameID: string; error?: never }
  | { nameID?: never; error: SamlSubjectError };

export function resolveSamlSubject(
  profile: SamlSubjectProfile | null | undefined,
  expectedIssuer?: string,
): SamlSubjectResolution {
  const nameID = profile?.nameID;
  if (typeof nameID !== 'string' || nameID.trim().length === 0) {
    return { error: 'missing_name_id' };
  }

  if (profile?.nameIDFormat === TRANSIENT_SAML_NAME_ID_FORMAT) {
    return { error: 'transient_name_id' };
  }

  const normalizedExpectedIssuer = expectedIssuer?.trim();
  const issuer = typeof profile?.issuer === 'string' ? profile.issuer.trim() : '';
  if (normalizedExpectedIssuer && issuer !== normalizedExpectedIssuer) {
    return { error: 'issuer_mismatch' };
  }

  return { nameID };
}
