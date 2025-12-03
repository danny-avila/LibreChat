# 🔒 feat: Add FIPS 140-2/140-3 compliant build option

## Summary
- Add FIPS 140-2/140-3 compliance support for regulated environments (government, healthcare, finance)
- New `Containerfile.fips` using Red Hat UBI 9 with FIPS-validated OpenSSL
- Replace non-compliant cryptographic algorithms with FIPS-approved alternatives
- Include comprehensive documentation with OpenShift deployment instructions

## Changes

### New Files
- `Containerfile.fips` - UBI 9-based container build with FIPS-validated OpenSSL
- `api/server/utils/crypto.js` - FIPS-compliant cryptographic utilities (PBKDF2, SHA-256)
- `docs/fips-compliance.md` - Comprehensive documentation including OpenShift deployment

### Modified Files
- `api/models/userMethods.js` - Use PBKDF2 for password verification
- `api/server/services/AuthService.js` - Use PBKDF2 and SHA-256 for password hashing and token verification
- `api/server/services/twoFactorService.js` - Use HMAC-SHA256 for TOTP 2FA
- `api/server/controllers/TwoFactorController.js` - Include `algorithm=SHA256` in QR code URI
- `packages/data-provider/src/actions.ts` - Use SHA-256 for operation hashing

## Cryptographic Algorithm Changes

| Component | Standard Build | FIPS Build | FIPS Status |
|-----------|---------------|------------|-------------|
| Password Hashing | bcrypt (Blowfish) | PBKDF2-HMAC-SHA256 (310k iterations) | ✅ APPROVED |
| TOTP 2FA | HMAC-SHA1 | HMAC-SHA256 | ✅ APPROVED |
| Token Hashing | bcrypt | SHA-256 | ✅ APPROVED |
| Operation Hash | SHA-1 | SHA-256 | ✅ APPROVED |

## ⚠️ Breaking Changes

The FIPS build is intended for **greenfield deployments only**. Upgrading existing deployments to FIPS mode is NOT supported because:

1. **Password Hashes:** Existing bcrypt hashes will not verify with PBKDF2
2. **TOTP 2FA:** Existing HMAC-SHA1 secrets will not work with HMAC-SHA256
3. **Verification Tokens:** Existing bcrypt token hashes will be invalid

Users upgrading must either:
- Start fresh with a new database
- Force all users to reset passwords and re-enroll in 2FA

## Test Plan

- [x] Build completes successfully on x86_64
- [x] Application starts without cryptographic errors
- [x] User registration works with PBKDF2 password hashing
- [x] TOTP 2FA enrollment works with HMAC-SHA256
- [x] Deployed and tested on FIPS-enabled OpenShift cluster

## Authenticator App Compatibility

TOTP with SHA-256 is supported by all major authenticator apps:
- Google Authenticator
- Authy
- 1Password
- Microsoft Authenticator
- FreeOTP

## Build Instructions

```bash
# Build the FIPS-compliant image
podman build --platform linux/amd64 -f Containerfile.fips -t librechat-fips:latest .

# Or with Docker
docker build --platform linux/amd64 -f Containerfile.fips -t librechat-fips:latest .
```

## Documentation

Complete deployment instructions are included in `docs/fips-compliance.md`:
- Helm chart installation with custom image
- Pull secret configuration
- Route creation with TLS
- FIPS mode verification commands
