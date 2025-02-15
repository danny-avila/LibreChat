import {
  createPayload,
  isAgentsEndpoint,
  isAssistantsEndpoint,
  removeNullishValues,
  TPayload,
  TSubmission,
} from 'librechat-data-provider';

/**
 * Convert an ArrayBuffer to a Base64 string.
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return window.btoa(binary);
}

/**
 * Convert a Base64 string to a Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a plaintext string using RSA-OAEP.
 * The public key must be provided as a Base64-encoded SPKI key.
 */
export async function encryptMessage(
  plainText: string,
  userEncryptionPublicKey: string
): Promise<string> {
  // Convert the Base64 public key into a binary array.
  const binaryKey = base64ToUint8Array(userEncryptionPublicKey);
  const publicKey = await window.crypto.subtle.importKey(
    'spki',
    binaryKey.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  );

  const encoder = new TextEncoder();
  const encodedContent = encoder.encode(plainText);

  const encryptedBuffer = await window.crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    encodedContent
  );

  // Return the encrypted data as a Base64 string.
  return arrayBufferToBase64(encryptedBuffer);
}

/**
 * Decrypts an encrypted string using RSA-OAEP.
 * The private key must be provided as a Base64-encoded PKCS#8 key.
 */
export async function decryptMessage(
  encryptedText: string,
  userPrivateKey: string
): Promise<string> {
  // Convert the Base64-encoded private key to a binary array.
  const binaryKey = base64ToUint8Array(userPrivateKey);
  const privateKey = await window.crypto.subtle.importKey(
    'pkcs8',
    binaryKey.buffer,
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  );

  // Convert the Base64-encoded encrypted text to a binary array.
  const encryptedBuffer = base64ToUint8Array(encryptedText);
  const decryptedBuffer = await window.crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedBuffer.buffer
  );
  const decoder = new TextDecoder();
  return decoder.decode(decryptedBuffer);
}

/**
 * Creates a payload from the submission.
 * If encryption is enabled (or if a userEncryptionPublicKey is available),
 * it encrypts the text and attaches a random IV (used as a flag).
 */
export async function createPayloadWithEncryption(
  submission: TSubmission,
  encryptionEnabled: boolean,
  userEncryptionPublicKey?: string
): Promise<{ server: string; payload: TPayload }> {
  // Create the standard payload.
  const payloadData = createPayload(submission);
  let { payload } = payloadData;

  // Remove nullish values for endpoints that require it.
  if (isAssistantsEndpoint(payload.endpoint) || isAgentsEndpoint(payload.endpoint)) {
    payload = removeNullishValues(payload) as TPayload;
  }

  // Force encryption if encryptionEnabled is true OR a public key is available.
  if ((encryptionEnabled || userEncryptionPublicKey) && userEncryptionPublicKey) {
    const plainText = payload.text;
    if (plainText !== undefined) {
      // Generate a random IV (12 bytes for AES-GCM). Although RSA-OAEP doesn’t need an IV,
      // we attach it as a marker that the message is encrypted.
      const ivArray = new Uint8Array(12);
      window.crypto.getRandomValues(ivArray);
      const ivString = arrayBufferToBase64(ivArray.buffer);

      // Encrypt the message text.
      const encryptedText = await encryptMessage(plainText, userEncryptionPublicKey);
      console.log('Encryption successful:', { encryptedText, iv: ivString });
      payload.text = encryptedText;
      // Attach the IV as a marker.
      (payload as TPayload & { messageEncryptionIV?: string }).messageEncryptionIV = ivString;
    }
  }
  return { server: payloadData.server, payload };
}