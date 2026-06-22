import { describe, it, expect } from 'vitest';
import {
  isValidName,
  isValidModel,
  validateAuth,
} from '../../src/lib/validators.js';

describe('isValidName', () => {
  it('принимает корректные имена', () => {
    expect(isValidName('John')).toBe(true);
    expect(isValidName('ab')).toBe(true); // минимум 2 символа
    expect(isValidName('Player_1')).toBe(true);
    expect(isValidName('a b c')).toBe(true); // допустимы пробелы внутри
  });

  it('отклоняет имена, начинающиеся не с буквы', () => {
    expect(isValidName('1abc')).toBe(false);
    expect(isValidName('_abc')).toBe(false);
    expect(isValidName(' abc')).toBe(false);
  });

  it('отклоняет слишком короткие и слишком длинные имена', () => {
    expect(isValidName('a')).toBe(false); // 1 символ
    expect(isValidName('a'.repeat(16))).toBe(false); // > 15
  });

  it('отклоняет имена с запрещёнными символами', () => {
    expect(isValidName('na<me>')).toBe(false);
    expect(isValidName('na;me')).toBe(false);
  });

  it('отклоняет не-строки', () => {
    expect(isValidName(123)).toBe(false);
    expect(isValidName(null)).toBe(false);
    expect(isValidName(undefined)).toBe(false);
  });
});

describe('isValidModel', () => {
  it('принимает только m1', () => {
    expect(isValidModel('m1')).toBe(true);
    expect(isValidModel('m2')).toBe(false);
    expect(isValidModel('')).toBe(false);
  });
});

describe('validateAuth', () => {
  const authParams = [
    { name: 'name', options: { validator: 'isValidName' } },
    { name: 'model', options: { validator: 'isValidModel' } },
  ];

  it('возвращает undefined при валидных данных', () => {
    const result = validateAuth({ name: 'John', model: 'm1' }, authParams);
    expect(result).toBeUndefined();
  });

  it('сообщает об отсутствующем свойстве', () => {
    const result = validateAuth({ name: 'John' }, authParams);
    expect(result).toEqual([{ name: 'model', error: 'Property is missing' }]);
  });

  it('сообщает о нестроковом значении', () => {
    const result = validateAuth({ name: 123, model: 'm1' }, authParams);
    expect(result).toEqual([
      { name: 'name', error: 'Property must be a string' },
    ]);
  });

  it('накапливает ошибки валидации', () => {
    const result = validateAuth({ name: '1', model: 'm9' }, authParams);
    expect(result).toEqual([
      { name: 'name', error: 'not valid' },
      { name: 'model', error: 'not valid' },
    ]);
  });

  it('параметр без валидатора считается валидным, если это строка', () => {
    const params = [{ name: 'free', options: {} }];
    expect(validateAuth({ free: 'anything' }, params)).toBeUndefined();
  });
});
