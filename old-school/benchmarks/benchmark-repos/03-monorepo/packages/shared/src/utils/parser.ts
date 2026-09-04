export interface ParseResult<T> {
  success: boolean;
  value?: T;
  error?: string;
  position?: number;
}

export interface Parser<T> {
  input: string;
  position: number;
  parse: (input: string) => ParseResult<T>;
}

export function createStringParser(expected: string): Parser<string> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      if (input.startsWith(expected)) {
        return { success: true, value: expected, position: expected.length };
      }
      return { success: false, error: `Expected "${expected}"`, position: 0 };
    },
  };
}

export function createRegexParser(regex: RegExp, name: string): Parser<string> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      const match = input.match(regex);
      if (match) {
        return { success: true, value: match[0], position: match[0].length };
      }
      return { success: false, error: `Expected ${name}`, position: 0 };
    },
  };
}

export function createNumberParser(): Parser<number> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      const match = input.match(/^-?\d+(\.\d+)?/);
      if (match) {
        return { success: true, value: parseFloat(match[0]), position: match[0].length };
      }
      return { success: false, error: 'Expected number', position: 0 };
    },
  };
}

export function createChoiceParser<T>(parsers: Parser<T>[]): Parser<T> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      for (const parser of parsers) {
        const result = parser.parse(input);
        if (result.success) return result;
      }
      return { success: false, error: 'No matching parser', position: 0 };
    },
  };
}

export function createSequenceParser<T>(parsers: Parser<T>[]): Parser<T[]> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      const results: T[] = [];
      let position = 0;
      for (const parser of parsers) {
        const result = parser.parse(input.slice(position));
        if (!result.success) {
          return { success: false, error: result.error, position: position + (result.position || 0) };
        }
        results.push(result.value!);
        position += result.position || 0;
      }
      return { success: true, value: results, position };
    },
  };
}

export function createOptionalParser<T>(parser: Parser<T>): Parser<T | null> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      const result = parser.parse(input);
      if (result.success) return result;
      return { success: true, value: null, position: 0 };
    },
  };
}

export function createManyParser<T>(parser: Parser<T>, min: number = 0, max: number = Infinity): Parser<T[]> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      const results: T[] = [];
      let position = 0;
      while (results.length < max) {
        const result = parser.parse(input.slice(position));
        if (!result.success) break;
        results.push(result.value!);
        position += result.position || 0;
      }
      if (results.length < min) {
        return { success: false, error: `Expected at least ${min} matches`, position };
      }
      return { success: true, value: results, position };
    },
  };
}

export function createJsonParser(): Parser<unknown> {
  return {
    input: '',
    position: 0,
    parse: (input: string) => {
      try {
        const trimmed = input.trim();
        const value = JSON.parse(trimmed);
        return { success: true, value, position: trimmed.length };
      } catch {
        return { success: false, error: 'Invalid JSON', position: 0 };
      }
    },
  };
}
