import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserLocalProvider } from './BrowserLocalProvider.js';

describe('BrowserLocalProvider', () => {
  let provider;
  beforeEach(() => { provider = new BrowserLocalProvider(); });

  it('is always available', async () => {
    expect(await provider.isAvailable()).toBe(true);
  });

  it('responds to greetings in Hebrew', async () => {
    const result = await provider.sendMessage('שלום', [], {});
    expect(result.provider).toBe('browser-local');
    expect(result.intent).toBe('greeting');
    expect(result.reply).toMatch(/שלום|צמח/);
  });

  it('responds to terpene questions with local knowledge', async () => {
    const result = await provider.sendMessage('מה זה מירסן?', [], {});
    expect(result.intent).toBe('A');
    expect(result.reply).toMatch(/מירסן|myrcene/i);
    expect(result.local_fallback).toBe(true);
  });

  it('responds to storage question', async () => {
    const result = await provider.sendMessage('איך לשמור את הפרח?', [], {});
    expect(result.intent).toBe('A');
    expect(result.reply).toMatch(/אחסון|טמפרטורה|לחות/i);
  });

  it('returns offline message for unmatched questions', async () => {
    const result = await provider.sendMessage('מה מחיר White Widow בנובה?', [], {});
    expect(result.intent).toBe('C');
    expect(result.reply).toMatch(/מנותק|offline|חיבור/i);
  });

  it('declines image analysis offline', async () => {
    const result = await provider.sendMessage('', [], { image: { data: 'abc', type: 'image/jpeg' } });
    expect(result.intent).toBe('IMAGE');
    expect(result.reply).toMatch(/שרת|server/i);
  });
});

describe('ServerProvider interface shape', () => {
  it('getName returns server', async () => {
    const { ServerProvider } = await import('./ServerProvider.js');
    expect(new ServerProvider().getName()).toBe('server');
  });
});
