/**
 * In-memory OTP store with TTL. Key: normalized email (lowercase) + cafeSlug. Value: { otp, expiresAt }.
 * OTPs expire after OTP_TTL_MS (default 10 minutes).
 */
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const store = new Map<string, { otp: string; expiresAt: number }>();

function key(email: string, cafeSlug: string): string {
  const e = (email && String(email).trim().toLowerCase()) || '';
  const c = (cafeSlug && String(cafeSlug).trim()) || 'default';
  return `${e}::${c}`;
}

export function set(email: string, cafeSlug: string, otp: string): void {
  const k = key(email, cafeSlug);
  store.set(k, {
    otp: String(otp),
    expiresAt: Date.now() + OTP_TTL_MS
  });
}

export function get(email: string, cafeSlug: string): string | null {
  const k = key(email, cafeSlug);
  const entry = store.get(k);
  if (!entry || Date.now() > entry.expiresAt) {
    store.delete(k);
    return null;
  }
  return entry.otp;
}

export function verifyAndConsume(email: string, cafeSlug: string, otp: string): boolean {
  const stored = get(email, cafeSlug);
  if (!stored || stored !== String(otp).trim()) {
    return false;
  }
  store.delete(key(email, cafeSlug));
  return true;
}
