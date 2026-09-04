export class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd: boolean = false;
  value?: any;
}

export class Trie {
  private root: TrieNode = new TrieNode();

  insert(word: string, value?: any): void {
    let node = this.root;
    
    for (const char of word.toLowerCase()) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    
    node.isEnd = true;
    node.value = value;
  }

  search(word: string): boolean {
    const node = this.findNode(word);
    return node !== null && node.isEnd;
  }

  startsWith(prefix: string): string[] {
    const node = this.findNode(prefix);
    
    if (!node) {
      return [];
    }
    
    const results: string[] = [];
    this.collectWords(node, prefix, results);
    return results;
  }

  private findNode(prefix: string): TrieNode | null {
    let node = this.root;
    
    for (const char of prefix.toLowerCase()) {
      if (!node.children.has(char)) {
        return null;
      }
      node = node.children.get(char)!;
    }
    
    return node;
  }

  private collectWords(node: TrieNode, prefix: string, results: string[]): void {
    if (node.isEnd) {
      results.push(prefix);
    }
    
    for (const [char, child] of node.children) {
      this.collectWords(child, prefix + char, results);
    }
  }
}
