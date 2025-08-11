// Lightweight AES-GCM encryption helpers for storing OAuth tokens at rest.
// Uses Web Crypto API available in Convex runtime.

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

async function importAesKey(secret: string): Promise<CryptoKey> {
  const secretBytes = textEncoder.encode(secret);
  const keyData = await crypto.subtle.digest("SHA-256", secretBytes);
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  // btoa is available in Convex runtime
  return btoa(binary);
}

function fromBase64(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export async function encryptString(plainText: string): Promise<string> {
  const secret = process.env.TOKENS_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing TOKENS_ENCRYPTION_KEY env var");

  const key = await importAesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipherBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    textEncoder.encode(plainText)
  );
  const ivB64 = toBase64(iv.buffer);
  const cipherB64 = toBase64(cipherBuffer);
  return `${ivB64}:${cipherB64}`;
}

export async function decryptString(payload: string): Promise<string> {
  const secret = process.env.TOKENS_ENCRYPTION_KEY;
  if (!secret) throw new Error("Missing TOKENS_ENCRYPTION_KEY env var");

  const [ivB64, cipherB64] = payload.split(":");
  if (!ivB64 || !cipherB64) throw new Error("Invalid encrypted payload format");
  const key = await importAesKey(secret);
  const iv = new Uint8Array(fromBase64(ivB64));
  const cipherBuffer = fromBase64(cipherB64);
  const plainBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    cipherBuffer
  );
  return textDecoder.decode(plainBuffer);
}


