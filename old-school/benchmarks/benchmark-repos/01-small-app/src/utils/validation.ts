import { body, param, query, ValidationChain } from 'express-validator';

export const validateUUID = (fieldName: string): ValidationChain =>
  param(fieldName).isUUID().withMessage(`${fieldName} must be a valid UUID`);

export const validateEmail = (fieldName: string = 'email'): ValidationChain =>
  body(fieldName).isEmail().normalizeEmail().withMessage('Must be a valid email address');

export const validatePassword = (fieldName: string = 'password'): ValidationChain =>
  body(fieldName)
    .isLength({ min: 8, max: 128 })
    .withMessage('Password must be 8-128 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number');

export const validateRequiredString = (fieldName: string, minLength: number = 1, maxLength: number = 255): ValidationChain =>
  body(fieldName)
    .trim()
    .isLength({ min: minLength, max: maxLength })
    .withMessage(`${fieldName} must be ${minLength}-${maxLength} characters`);

export const validateOptionalString = (fieldName: string, maxLength: number = 255): ValidationChain =>
  body(fieldName)
    .optional()
    .trim()
    .isLength({ max: maxLength })
    .withMessage(`${fieldName} must be at most ${maxLength} characters`);

export const validateEnum = <T extends string>(fieldName: string, values: readonly T[]): ValidationChain =>
  body(fieldName).isIn(values as unknown as string[]).withMessage(`${fieldName} must be one of: ${values.join(', ')}`);

export const validateISODate = (fieldName: string): ValidationChain =>
  body(fieldName).isISO8601().withMessage(`${fieldName} must be a valid ISO date`);

export const validateOptionalISODate = (fieldName: string): ValidationChain =>
  body(fieldName).optional({ nullable: true }).isISO8601().withMessage(`${fieldName} must be a valid ISO date`);

export const validatePagination = (): ValidationChain[] => [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be 1-100'),
];

export const sanitizeInput = (input: string): string => {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[&<>"']/g, (char) => {
      const entities: Record<string, string> = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
      };
      return entities[char] || char;
    })
    .trim();
};
