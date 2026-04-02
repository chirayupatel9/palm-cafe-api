import type { CorsOptions } from 'cors';

/**
 * Builds allowed browser origins. Combines env URLs, optional CORS_ORIGINS list,
 * dev defaults, and localhost ↔ 127.0.0.1 aliases (same port).
 */
export function buildAllowedCorsOrigins(): string[] {
  const extras = (process.env.CORS_ORIGINS || process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  const list: string[] = [
    'https://app.cafe.nevyaa.com',
    process.env.FRONTEND_URL,
    process.env.ADMIN_URL,
    ...extras
  ].filter((x): x is string => Boolean(x && String(x).trim()));

  const isDevLike = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  if (isDevLike) {
    list.push(
      'http://localhost:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:3001'
    );
  }

  const expanded = new Set<string>();
  for (const o of list) {
    const origin = o.trim();
    if (!origin) {
      continue;
    }
    expanded.add(origin);
    const asLocalhost = /^http:\/\/localhost:(\d+)$/i.exec(origin);
    if (asLocalhost) {
      expanded.add(`http://127.0.0.1:${asLocalhost[1]}`);
    }
    const asLoopback = /^http:\/\/127\.0\.0\.1:(\d+)$/i.exec(origin);
    if (asLoopback) {
      expanded.add(`http://localhost:${asLoopback[1]}`);
    }
  }

  return [...expanded];
}

export function createCorsOptions(): CorsOptions {
  const allowedOrigins = buildAllowedCorsOrigins();

  return {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'X-Request-ID']
  };
}
