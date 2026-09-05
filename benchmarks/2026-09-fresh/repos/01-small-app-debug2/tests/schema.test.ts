import { describe, it, expect } from 'vitest';
import {
  StringValidator,
  NumberValidator,
  ArrayValidator,
  Schema,
} from '../src/utils/schema.js';

describe('Schema Validators', () => {
  describe('StringValidator', () => {
    it('should validate required strings', () => {
      const validator = new StringValidator({ required: true });
      
      expect(validator.validate('')).toEqual({
        valid: false,
        errors: ['Value is required'],
      });
      
      expect(validator.validate('hello')).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('should validate min/max length', () => {
      const validator = new StringValidator({ minLength: 3, maxLength: 10 });
      
      expect(validator.validate('ab')).toEqual({
        valid: false,
        errors: ['Minimum length is 3'],
      });
      
      expect(validator.validate('hello')).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('should validate patterns', () => {
      const validator = new StringValidator({ pattern: /^[a-z]+$/ });
      
      expect(validator.validate('hello')).toEqual({
        valid: true,
        errors: [],
      });
      
      expect(validator.validate('Hello')).toEqual({
        valid: false,
        errors: ['Value does not match required pattern'],
      });
    });
  });

  describe('NumberValidator', () => {
    it('should validate min/max values', () => {
      const validator = new NumberValidator({ min: 0, max: 100 });
      
      expect(validator.validate(-1)).toEqual({
        valid: false,
        errors: ['Minimum value is 0'],
      });
      
      expect(validator.validate(50)).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('should validate integers', () => {
      const validator = new NumberValidator({ integer: true });
      
      expect(validator.validate(1.5)).toEqual({
        valid: false,
        errors: ['Value must be an integer'],
      });
      
      expect(validator.validate(1)).toEqual({
        valid: true,
        errors: [],
      });
    });
  });

  describe('ArrayValidator', () => {
    it('should validate array length', () => {
      const validator = new ArrayValidator({ minLength: 2, maxLength: 5 });
      
      expect(validator.validate([1])).toEqual({
        valid: false,
        errors: ['Minimum length is 2'],
      });
      
      expect(validator.validate([1, 2, 3])).toEqual({
        valid: true,
        errors: [],
      });
    });

    it('should validate items', () => {
      const itemValidator = new NumberValidator({ min: 0 });
      const validator = new ArrayValidator({ itemValidator });
      
      expect(validator.validate([-1, 0, 1])).toEqual({
        valid: false,
        errors: ['Item 0: Minimum value is 0'],
      });
      
      expect(validator.validate([0, 1, 2])).toEqual({
        valid: true,
        errors: [],
      });
    });
  });

  describe('Schema', () => {
    it('should chain validators', () => {
      const schema = new Schema<string>();
      schema.add(new StringValidator({ required: true }));
      schema.add(new StringValidator({ minLength: 3 }));
      
      expect(schema.validate('')).toEqual({
        valid: false,
        errors: ['Value is required'],
      });
      
      expect(schema.validate('ab')).toEqual({
        valid: false,
        errors: ['Minimum length is 3'],
      });
      
      expect(schema.validate('hello')).toEqual({
        valid: true,
        errors: [],
      });
    });
  });
});
