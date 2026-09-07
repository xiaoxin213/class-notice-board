import {
  scryptSync, randomBytes, timingSafeEqual, createHmac, createHash,
} from 'node:crypto';

const KEYLEN = 32;

export function hashPassword(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(plain, salt, KEYLEN);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export function verifyPassword(plain, stored) {
  const [saltHex, hashHex] = String(stored).split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== KEYLEN) return false;
  const actual = scryptSync(plain, Buffer.from(saltHex, 'hex'), KEYLEN);
  return timingSafeEqual(expected, actual);
}

const b64u = (buf) => Buffer.from(buf).toString('base64url');

/** 自签令牌：payload.signature，避免为一个 JWT 引入额外依赖 */
export function signToken(payload, secret, ttlSeconds) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const encoded = b64u(JSON.stringify(body));
  const sig = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyToken(token, secret) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [encoded, sig] = token.split('.');
  const expected = createHmac('sha256', secret).update(encoded).digest('base64url');
  if (sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const body = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch {
    return null;
  }
}

/** 设备令牌是长期凭据，只存散列 */
export const newDeviceToken = () => randomBytes(32).toString('base64url');
export const hashDeviceToken = (t) => createHash('sha256').update(t).digest('hex');

/** 6 位数字绑定码，用加密随机数避免可预测 */
export function newBindCode() {
  return String(randomBytes(4).readUInt32BE(0) % 1_000_000).padStart(6, '0');
}
