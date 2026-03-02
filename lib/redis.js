/**
 * Optional Redis client for rate limiting and account lockout (multi-instance).
 * When REDIS_URL is not set or connection fails, callers fall back to in-memory.
 */
const logger = require('../config/logger');

let client = null;
let rateLimitStore = null;

async function connect() {
  if (client) return client;
  const url = process.env.REDIS_URL || (process.env.REDIS_HOST && `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT || 6379}`);
  if (!url) return null;
  try {
    const { createClient } = require('redis');
    const { RedisStore } = require('rate-limit-redis');
    if (!createClient || !RedisStore) return null;
    client = createClient({ url });
    client.on('error', (err) => logger.warn('Redis client error', { message: err.message }));
    await client.connect();
    rateLimitStore = new RedisStore({
      sendCommand: (...args) => client.sendCommand(args)
    });
    logger.info('Redis connected for rate limit and lockout');
    return client;
  } catch (err) {
    logger.warn('Redis not available, using in-memory fallback', { message: err.message });
    return null;
  }
}

async function getRateLimitStore() {
  await connect();
  return rateLimitStore || null;
}

function getClient() {
  return client;
}

async function get(key) {
  if (!client) return null;
  try {
    return await client.get(key);
  } catch (err) {
    logger.warn('Redis get failed', { key, message: err.message });
    return null;
  }
}

async function set(key, value, options = {}) {
  if (!client) return false;
  try {
    if (options.px) {
      await client.set(key, value, { PX: options.px });
    } else {
      await client.set(key, value);
    }
    return true;
  } catch (err) {
    logger.warn('Redis set failed', { key, message: err.message });
    return false;
  }
}

async function del(key) {
  if (!client) return false;
  try {
    await client.del(key);
    return true;
  } catch (err) {
    logger.warn('Redis del failed', { key, message: err.message });
    return false;
  }
}

async function close() {
  if (client) {
    try {
      await client.quit();
    } catch (e) { /* ignore */ }
    client = null;
    rateLimitStore = null;
  }
}

module.exports = {
  connect,
  getRateLimitStore,
  getClient,
  get,
  set,
  del,
  close
};
