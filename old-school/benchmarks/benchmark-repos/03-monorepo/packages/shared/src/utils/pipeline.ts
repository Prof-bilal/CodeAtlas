export type PipelineStage<T> = (input: T) => T | Promise<T>;

export interface PipelineConfig {
  name: string;
  stages: string[];
}

export class Pipeline<T> {
  private stages: Array<{ name: string; fn: PipelineStage<T> }> = [];
  private config: PipelineConfig;

  constructor(name: string) {
    this.config = { name, stages: [] };
  }

  addStage(name: string, fn: PipelineStage<T>): this {
    this.stages.push({ name, fn });
    this.config.stages.push(name);
    return this;
  }

  async execute(input: T): Promise<T> {
    let result = input;
    for (const stage of this.stages) {
      result = await stage.fn(result);
    }
    return result;
  }

  getStages(): string[] {
    return [...this.config.stages];
  }

  getStageCount(): number {
    return this.stages.length;
  }

  removeStage(name: string): boolean {
    const index = this.stages.findIndex(s => s.name === name);
    if (index > -1) {
      this.stages.splice(index, 1);
      this.config.stages.splice(index, 1);
      return true;
    }
    return false;
  }

  insertStage(afterName: string, name: string, fn: PipelineStage<T>): boolean {
    const index = this.stages.findIndex(s => s.name === afterName);
    if (index > -1) {
      this.stages.splice(index + 1, 0, { name, fn });
      this.config.stages.splice(index + 1, 0, name);
      return true;
    }
    return false;
  }

  getConfig(): PipelineConfig {
    return { ...this.config };
  }
}

export function createPipeline<T>(name: string): Pipeline<T> {
  return new Pipeline<T>(name);
}

export function createDataPipeline(name: string): Pipeline<Record<string, unknown>> {
  return createPipeline<Record<string, unknown>>(name);
}
