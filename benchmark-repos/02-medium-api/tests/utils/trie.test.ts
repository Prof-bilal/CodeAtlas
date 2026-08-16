import { describe, it, expect } from 'vitest';
import { Trie } from '../../src/utils/trie.js';

describe('Trie', () => {
  it('should insert and search words', () => {
    const trie = new Trie();
    trie.insert('hello');
    trie.insert('help');
    trie.insert('world');

    expect(trie.search('hello')).toBe(true);
    expect(trie.search('help')).toBe(true);
    expect(trie.search('world')).toBe(true);
    expect(trie.search('hell')).toBe(false);
  });

  it('should find words with prefix', () => {
    const trie = new Trie();
    trie.insert('hello');
    trie.insert('help');
    trie.insert('world');

    const results = trie.startsWith('hel');
    expect(results).toContain('hello');
    expect(results).toContain('help');
    expect(results).not.toContain('world');
  });

  it('should delete words', () => {
    const trie = new Trie();
    trie.insert('hello');
    trie.insert('help');
    trie.remove('hello');
    expect(trie.search('hello')).toBe(false);
    expect(trie.search('help')).toBe(true);
  });
});
