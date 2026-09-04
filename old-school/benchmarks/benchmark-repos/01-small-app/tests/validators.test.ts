import { describe, it, expect } from 'vitest';
import {
  isString,
  isNumber,
  isBoolean,
  isDate,
  isObject,
  isArray,
  isFunction,
  isUndefined,
  isNull,
  isNil,
  isPrimitive,
  isPlainObject,
  isEmpty,
  isEqual,
} from '../src/utils/validators.js';

describe('Validators', () => {
  describe('isString', () => {
    it('should return true for strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
    });

    it('should return false for non-strings', () => {
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
    });
  });

  describe('isNumber', () => {
    it('should return true for numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber(-1.5)).toBe(true);
    });

    it('should return false for non-numbers', () => {
      expect(isNumber('123')).toBe(false);
      expect(isNumber(NaN)).toBe(false);
    });
  });

  describe('isDate', () => {
    it('should return true for valid dates', () => {
      expect(isDate(new Date())).toBe(true);
    });

    it('should return false for invalid dates', () => {
      expect(isDate('2024-01-01')).toBe(false);
      expect(isDate(new Date('invalid'))).toBe(false);
    });
  });

  describe('isObject', () => {
    it('should return true for objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ a: 1 })).toBe(true);
    });

    it('should return false for non-objects', () => {
      expect(isObject(null)).toBe(false);
      expect(isObject([])).toBe(false);
    });
  });

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
    });

    it('should return false for non-arrays', () => {
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
    });
  });

  describe('isEmpty', () => {
    it('should return true for empty values', () => {
      expect(isEmpty(null)).toBe(true);
      expect(isEmpty(undefined)).toBe(true);
      expect(isEmpty('')).toBe(true);
      expect(isEmpty([])).toBe(true);
      expect(isEmpty({})).toBe(true);
    });

    it('should return false for non-empty values', () => {
      expect(isEmpty('hello')).toBe(false);
      expect(isEmpty([1])).toBe(false);
      expect(isEmpty({ a: 1 })).toBe(false);
    });
  });

  describe('isEqual', () => {
    it('should return true for equal values', () => {
      expect(isEqual(1, 1)).toBe(true);
      expect(isEqual('hello', 'hello')).toBe(true);
      expect(isEqual({ a: 1 }, { a: 1 })).toBe(true);
      expect(isEqual([1, 2], [1, 2])).toBe(true);
    });

    it('should return false for different values', () => {
      expect(isEqual(1, 2)).toBe(false);
      expect(isEqual({ a: 1 }, { a: 2 })).toBe(false);
      expect(isEqual([1, 2], [1, 3])).toBe(false);
    });
  });
});
