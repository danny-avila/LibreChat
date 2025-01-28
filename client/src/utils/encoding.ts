import base64url from 'base64url';

export const encode = (arrayBuffer) => base64url(Buffer.from(arrayBuffer));
export const decode = (base64String) => Buffer.from(base64url.toBuffer(base64String));