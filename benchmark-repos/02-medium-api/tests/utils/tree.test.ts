import { describe, it, expect } from 'vitest';
import { Tree } from '../../src/utils/tree.js';

describe('Tree', () => {
  it('should add children', () => {
    const tree = new Tree<number>(1);
    tree.root.addChild(2);
    tree.root.addChild(3);
    expect(tree.root.children.length).toBe(2);
  });

  it('should traverse depth first', () => {
    const tree = new Tree<number>(1);
    tree.root.addChild(2);
    tree.root.addChild(3);
    tree.root.children[0].addChild(4);

    const result: number[] = [];
    tree.dfs((node) => result.push(node.value));
    expect(result).toContain(1);
    expect(result).toContain(2);
    expect(result).toContain(3);
    expect(result).toContain(4);
  });

  it('should traverse breadth first', () => {
    const tree = new Tree<number>(1);
    tree.root.addChild(2);
    tree.root.addChild(3);

    const result: number[] = [];
    tree.bfs((node) => result.push(node.value));
    expect(result).toEqual([1, 2, 3]);
  });

  it('should find node', () => {
    const tree = new Tree<number>(1);
    tree.root.addChild(2);
    tree.root.addChild(3);

    const node = tree.find(3);
    expect(node).toBeDefined();
    expect(node!.value).toBe(3);
  });
});
