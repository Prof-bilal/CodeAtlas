export class BloomFilter {
  private size: number;
  private hashCount: number;
  private bits: Uint8Array;
  private count = 0;

  constructor(size: number = 1000, hashCount: number = 3) {
    this.size = size;
    this.hashCount = hashCount;
    this.bits = new Uint8Array(size);
  }

  add(item: string): void {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      this.bits[index] = 1;
    }
    this.count++;
  }

  mightContain(item: string): boolean {
    for (let i = 0; i < this.hashCount; i++) {
      const index = this.hash(item, i);
      if (this.bits[index] === 0) return false;
    }
    return true;
  }

  private hash(item: string, seed: number): number {
    let hash = 0;
    for (let i = 0; i < item.length; i++) {
      hash = (hash * 31 + item.charCodeAt(i) + seed) % this.size;
    }
    return Math.abs(hash);
  }

  getFalsePositiveRate(): number {
    return Math.pow(1 - Math.exp(-this.hashCount * this.count / this.size), this.hashCount);
  }

  getCount(): number {
    return this.count;
  }

  getSize(): number {
    return this.size;
  }

  clear(): void {
    this.bits.fill(0);
    this.count = 0;
  }

  getStats() {
    return {
      size: this.size,
      hashCount: this.hashCount,
      count: this.count,
      fillRate: this.bits.filter(b => b === 1).length / this.size,
      falsePositiveRate: this.getFalsePositiveRate(),
    };
  }
}

export function createBloomFilter(size?: number, hashCount?: number): BloomFilter {
  return new BloomFilter(size, hashCount);
}
