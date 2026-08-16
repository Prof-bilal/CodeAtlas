export interface Pattern {
  regex: RegExp;
  name: string;
  description: string;
}

export const PATTERNS: Record<string, Pattern> = {
  email: {
    regex: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
    name: 'Email',
    description: 'Valid email address',
  },
  url: {
    regex: /^https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)$/,
    name: 'URL',
    description: 'Valid URL',
  },
  phone: {
    regex: /^\+?[1-9]\d{1,14}$/,
    name: 'Phone',
    description: 'International phone number',
  },
  uuid: {
    regex: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    name: 'UUID',
    description: 'UUID v1-5',
  },
  ipv4: {
    regex: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
    name: 'IPv4',
    description: 'IPv4 address',
  },
  ipv6: {
    regex: /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/,
    name: 'IPv6',
    description: 'IPv6 address',
  },
  hex: {
    regex: /^[0-9a-fA-F]+$/,
    name: 'Hex',
    description: 'Hexadecimal string',
  },
  base64: {
    regex: /^[A-Za-z0-9+/]*={0,2}$/,
    name: 'Base64',
    description: 'Base64 encoded string',
  },
  alphanumeric: {
    regex: /^[a-zA-Z0-9]+$/,
    name: 'Alphanumeric',
    description: 'Alphanumeric characters only',
  },
  alpha: {
    regex: /^[a-zA-Z]+$/,
    name: 'Alpha',
    description: 'Letters only',
  },
  numeric: {
    regex: /^[0-9]+$/,
    name: 'Numeric',
    description: 'Numbers only',
  },
  slug: {
    regex: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
    name: 'Slug',
    description: 'URL-friendly slug',
  },
  creditCard: {
    regex: /^(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3(?:0[0-5]|[68][0-9])[0-9]{11}|6(?:011|5[0-9]{2})[0-9]{12}|(?:2131|1800|35\d{3})\d{11})$/,
    name: 'Credit Card',
    description: 'Credit card number',
  },
  date: {
    regex: /^\d{4}-\d{2}-\d{2}$/,
    name: 'Date',
    description: 'ISO date format (YYYY-MM-DD)',
  },
  datetime: {
    regex: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    name: 'DateTime',
    description: 'ISO datetime format',
  },
  time: {
    regex: /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/,
    name: 'Time',
    description: 'Time format (HH:mm or HH:mm:ss)',
  },
  zipCode: {
    regex: /^\d{5}(-\d{4})?$/,
    name: 'ZIP Code',
    description: 'US ZIP code',
  },
  strongPassword: {
    regex: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
    name: 'Strong Password',
    description: 'At least 8 chars, uppercase, lowercase, number, special char',
  },
};

export function validatePattern(value: string, patternName: string): boolean {
  const pattern = PATTERNS[patternName];
  if (!pattern) return false;
  return pattern.regex.test(value);
}

export function validateAgainstAll(value: string, patternNames: string[]): boolean {
  return patternNames.every(name => validatePattern(value, name));
}

export function validateAgainstAny(value: string, patternNames: string[]): boolean {
  return patternNames.some(name => validatePattern(value, name));
}

export function getPattern(name: string): Pattern | undefined {
  return PATTERNS[name];
}

export function getAllPatternNames(): string[] {
  return Object.keys(PATTERNS);
}
