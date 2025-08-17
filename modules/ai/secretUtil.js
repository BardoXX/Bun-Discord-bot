// modules/ai/secretUtil.js
// Simple AES-256-GCM encryption/decryption using a master key from env (AI_MASTER_KEY)
// AI_MASTER_KEY should be 32 bytes. You can supply it as raw 32-byte string, or base64, or hex.

import crypto from 'crypto';

function loadKey() {
  const raw = process.env.AI_MASTER_KEY;
  if (!raw) return null;
  try {
    if (raw.length === 32) return Buffer.from(raw, 'utf8');
    if (/^[A-Fa-f0-9]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
    // try base64
    const b = Buffer.from(raw, 'base64');
    if (b.length === 32) return b;
  } catch {}
  return null;
}

export function canEncrypt() {
  return !!loadKey();
}

export function encryptString(plain) {
  const key = loadKey();
  if (!key) throw new Error('AI_MASTER_KEY missing or invalid (need 32 bytes)');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptString(encB64) {
  const key = loadKey();
  if (!key) throw new Error('AI_MASTER_KEY missing or invalid (need 32 bytes)');
  const buf = Buffer.from(String(encB64), 'base64');
  if (buf.length < 12 + 16) throw new Error('ciphertext too short');
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const data = buf.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

export default { canEncrypt, encryptString, decryptString };
