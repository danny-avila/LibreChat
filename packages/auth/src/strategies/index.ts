export { setupOpenId, getOpenIdConfig } from './openidStrategy';
export { default as openIdJwtLogin } from './openIdJwtStrategy';

export { default as googleLogin } from './googleStrategy';
export { default as facebookLogin } from './facebookStrategy';
export { default as discordLogin } from './discordStrategy';
export { default as githubLogin } from './githubStrategy';
export { default as socialLogin } from './socialLogin';
export { samlLogin, getCertificateContent } from './samlStrategy';
export { default as ldapLogin } from './ldapStrategy';
export { default as passportLogin } from './localStrategy';
export { default as jwtLogin } from './jwtStrategy';
export { loginSchema, registerSchema } from './validators';

// export this helper so we can mock them
export { createSocialUser, handleExistingUser } from './helpers';
