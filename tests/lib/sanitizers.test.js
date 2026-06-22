import { describe, it, expect } from 'vitest';
import { sanitizeMessage } from '../../src/lib/sanitizers.js';

describe('sanitizeMessage', () => {
  it('удаляет запрещённые символы', () => {
    expect(sanitizeMessage('a<b>c')).toBe('abc');
    expect(sanitizeMessage('hello & "world"')).toBe('hello  world');
    expect(sanitizeMessage('a;b|c%d')).toBe('abcd');
  });

  it('оставляет обычный текст без изменений', () => {
    expect(sanitizeMessage('normal text 123')).toBe('normal text 123');
  });

  it('вырезает дефис (зафиксировано текущее поведение)', () => {
    // Внимание: текущее правило удаляет дефис, ломая слова вроде "кто-то".
    expect(sanitizeMessage('кто-то')).toBe('ктото');
  });

  it('возвращает undefined для не-строки (текущее поведение)', () => {
    expect(sanitizeMessage(123)).toBeUndefined();
    expect(sanitizeMessage(null)).toBeUndefined();
  });
});
