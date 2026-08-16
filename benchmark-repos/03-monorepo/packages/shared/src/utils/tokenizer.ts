export interface Token {
  type: string;
  value: string;
  position: number;
}

export interface Tokenizer {
  tokenize: (input: string) => Token[];
}

export function createKeywordTokenizer(keywords: string[]): Tokenizer {
  return {
    tokenize: (input: string) => {
      const tokens: Token[] = [];
      let position = 0;
      while (position < input.length) {
        let matched = false;
        for (const keyword of keywords) {
          if (input.startsWith(keyword, position)) {
            tokens.push({ type: 'keyword', value: keyword, position });
            position += keyword.length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          tokens.push({ type: 'char', value: input[position], position });
          position++;
        }
      }
      return tokens;
    },
  };
}

export function createRegexTokenizer(patterns: Array<{ type: string; regex: RegExp }>): Tokenizer {
  return {
    tokenize: (input: string) => {
      const tokens: Token[] = [];
      let position = 0;
      while (position < input.length) {
        let matched = false;
        for (const { type, regex } of patterns) {
          const remaining = input.slice(position);
          const match = remaining.match(regex);
          if (match && match.index === 0) {
            tokens.push({ type, value: match[0], position });
            position += match[0].length;
            matched = true;
            break;
          }
        }
        if (!matched) {
          tokens.push({ type: 'unknown', value: input[position], position });
          position++;
        }
      }
      return tokens;
    },
  };
}

export function createJsonTokenizer(): Tokenizer {
  return createRegexTokenizer([
    { type: 'string', regex: /^"(?:[^"\\]|\\.)*"/ },
    { type: 'number', regex: /^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/ },
    { type: 'boolean', regex: /^(?:true|false)/ },
    { type: 'null', regex: /^null/ },
    { type: 'whitespace', regex: /^\s+/ },
    { type: 'punctuation', regex: /^[{}[\]:,]/ },
  ]);
}

export function createSqlTokenizer(): Tokenizer {
  return createRegexTokenizer([
    { type: 'keyword', regex: /^(?:SELECT|FROM|WHERE|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|INDEX|JOIN|ON|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|AS|ORDER|BY|GROUP|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|COUNT|SUM|AVG|MIN|MAX|SET|VALUES|INTO|VALUES|RETURNING)/i },
    { type: 'identifier', regex: /^[a-zA-Z_][a-zA-Z0-9_]*/ },
    { type: 'string', regex: /^'(?:[^'\\]|\\.)*'/ },
    { type: 'number', regex: /^-?\d+(?:\.\d+)?/ },
    { type: 'operator', regex: /^(?:=|<>|!=|<|>|<=|>=|\+|-|\*|\/|%)/ },
    { type: 'whitespace', regex: /^\s+/ },
    { type: 'punctuation', regex: /^[();,.]/ },
  ]);
}

export function filterTokens(tokens: Token[], type: string): Token[] {
  return tokens.filter(t => t.type === type);
}

export function getTokenValues(tokens: Token[], type: string): string[] {
  return filterTokens(tokens, type).map(t => t.value);
}

export function tokensToString(tokens: Token[]): string {
  return tokens.map(t => t.value).join('');
}
