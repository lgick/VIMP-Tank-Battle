import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// security.origin читает config (синглтон) и process.env.NODE_ENV.
// Перезагружаем модули, чтобы config начинался пустым в каждом тесте.
let security;
let config;
const ORIGINAL_ENV = process.env.NODE_ENV;

beforeEach(async () => {
  vi.resetModules();
  config = (await import('../../src/lib/config.js')).default;
  config.set('server:domain', 'example.com');
  config.set('server:port', 3000);
  config.set('server:protocol', 'https:');
  security = (await import('../../src/lib/security.js')).default;
});

afterEach(() => {
  process.env.NODE_ENV = ORIGINAL_ENV;
});

// оборачивает callback-стиль origin в промис с ошибкой (или null)
const checkOrigin = requestOrigin =>
  new Promise(resolve => security.origin(requestOrigin, err => resolve(err)));

describe('security.origin: разработка', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'development';
  });

  it('разрешает localhost на dev-порту', async () => {
    expect(await checkOrigin('https://localhost:3000')).toBeNull();
  });

  it('разрешает 127.0.0.1 на dev-порту', async () => {
    expect(await checkOrigin('https://127.0.0.1:3000')).toBeNull();
  });

  it('блокирует продакшен-домен в режиме разработки', async () => {
    const err = await checkOrigin('https://example.com');
    expect(err).toMatch(/invalid origin/);
  });

  it('блокирует сторонний origin', async () => {
    const err = await checkOrigin('https://evil.test');
    expect(err).toContain('evil.test');
  });

  it('блокирует localhost на чужом порту', async () => {
    expect(await checkOrigin('https://localhost:9999')).toMatch(
      /invalid origin/,
    );
  });
});

describe('security.origin: продакшен', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'production';
  });

  it('разрешает настоящий домен по HTTPS', async () => {
    expect(await checkOrigin('https://example.com')).toBeNull();
  });

  it('по-прежнему блокирует сторонний origin', async () => {
    expect(await checkOrigin('https://phishing.example.org')).toMatch(
      /invalid origin/,
    );
  });
});
