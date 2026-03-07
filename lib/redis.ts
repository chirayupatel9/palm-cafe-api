/**
 * Optional Redis client for rate limiting and account lockout.
 */
import logger from '../config/logger';

let client: unknown = null;
let rateLimitStore: unknown = null;

export async function connect(): Promise<unknown> {
  if (client) return client;
  const url =
    process.env.REDIS_URL ||
    (process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`);
  if (!url) return null;
  try {
    const { createClient } = require('redis');
    const { RedisStore } = require('rate-limit-redis');
    if (!createClient || !RedisStore) return null;
    const c = createClient({ url });
    client = c;
    c.on('error', (err: Error) => logger.warn('Redis client error', { message: err.message }));
    await c.connect();
    rateLimitStore = new RedisStore({
      sendCommand: (...args: unknown[]) => c.sendCommand(args)
    });
    logger.info('Redis connected for rate limit and lockout');
    return client;
  } catch (err) {
    logger.warn('Redis not available, using in-memory fallback', { message: (err as Error).message });
    return null;
  }
}

export async function getRateLimitStore(): Promise<unknown> {
  await connect();
  return rateLimitStore;
}

export function getClient(): unknown {
  return client;
}

export async function get(key: string): Promise<string | null> {
  if (!client) return null;
  try {
    return await (client as { get: (k: string) => Promise<string | null> }).get(key);
  } catch (err) {
    logger.warn('Redis get failed', { key, message: (err as Error).message });
    return null;
  }
}

export async function set(key: string, value: string, options: { px?: number } = {}): Promise<boolean> {
  if (!client) return false;
  try {
    const c = client as { set: (k: string, v: string, o?: { PX: number }) => Promise<void> };
    if (options.px != null) {
      await c.set(key, value, { PX: options.px });
    } else {
      await c.set(key, value);
    }
    return true;
  } catch (err) {
    logger.warn('Redis set failed', { key, message: (err as Error).message });
    return false;
  }
}

export async function del(key: string): Promise<boolean> {
  if (!client) return false;
  try {
    const c = client as { del: (k: string) => Promise<void> };
    await c.del(key);
    return true;
  } catch (err) {
    logger.warn('Redis del failed', { key, message: (err as Error).message });
    return false;
  }
}

export async function close(): Promise<void> {
  if (client) {
    try {
      await (client as { quit: () => Promise<void> }).quit();
    } catch (_e) {
      /* ignore */
    }
    client = null;
    rateLimitStore = null;
  }
}
