import { describe, it, expect } from 'vitest';
import {
  createHttpStep,
  createTransformStep,
  createFilterStep,
  createDelayStep,
  createConditionStep,
  createParallelStep,
  createAggregateStep,
  createNotifyStep,
} from '../src/core/workflows/steps.js';

describe('Workflow Step Definitions', () => {
  it('should have createHttpStep', () => { expect(createHttpStep).toBeDefined(); });
  it('should have createTransformStep', () => { expect(createTransformStep).toBeDefined(); });
  it('should have createFilterStep', () => { expect(createFilterStep).toBeDefined(); });
  it('should have createDelayStep', () => { expect(createDelayStep).toBeDefined(); });
  it('should have createConditionStep', () => { expect(createConditionStep).toBeDefined(); });
  it('should have createParallelStep', () => { expect(createParallelStep).toBeDefined(); });
  it('should have createAggregateStep', () => { expect(createAggregateStep).toBeDefined(); });
  it('should have createNotifyStep', () => { expect(createNotifyStep).toBeDefined(); });

  describe('Step Execution', () => {
    it('should execute transform step', async () => {
      const step = createTransformStep({
        transform: (input) => ({ ...input, processed: true }),
      });
      const result = await step.execute({ data: 'test' });
      expect(result).toEqual({ data: 'test', processed: true });
    });

    it('should execute filter step', async () => {
      const step = createFilterStep({
        predicate: (input) => input.value > 0,
      });
      const result = await step.execute({ value: 5 });
      expect(result).toEqual({ value: 5 });
    });

    it('should execute delay step', async () => {
      const step = createDelayStep({ delayMs: 50 });
      const start = Date.now();
      await step.execute({ data: 'test' });
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(40);
    });

    it('should execute parallel step', async () => {
      const step = createParallelStep({
        steps: [
          createTransformStep({ transform: (i) => ({ ...i, a: true }) }),
          createTransformStep({ transform: (i) => ({ ...i, b: true }) }),
        ],
      });
      const result = await step.execute({ data: 'test' });
      expect(result).toHaveLength(2);
    });

    it('should execute aggregate step', async () => {
      const step = createAggregateStep({
        aggregator: (results) => results.reduce((sum, r) => sum + r.value, 0),
      });
      const result = await step.execute([{ value: 1 }, { value: 2 }, { value: 3 }]);
      expect(result).toBe(6);
    });

    it('should execute notify step', async () => {
      const notifyFn = jest.fn();
      const step = createNotifyStep({ notify: notifyFn });
      await step.execute({ data: 'test' });
      expect(notifyFn).toHaveBeenCalledWith({ data: 'test' });
    });
  });
});
