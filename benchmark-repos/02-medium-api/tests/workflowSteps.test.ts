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

describe('Workflow Steps', () => {
  describe('createHttpStep', () => {
    it('should create HTTP step', () => {
      const step = createHttpStep({ url: 'https://example.com' });
      expect(step).toBeDefined();
      expect(step.type).toBe('http');
    });
  });

  describe('createTransformStep', () => {
    it('should create transform step', () => {
      const step = createTransformStep({
        transform: (input) => ({ ...input, transformed: true }),
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('transform');
    });

    it('should execute transform step', async () => {
      const step = createTransformStep({
        transform: (input) => ({ ...input, transformed: true }),
      });
      const result = await step.execute({ data: 'test' });
      expect(result).toEqual({ data: 'test', transformed: true });
    });
  });

  describe('createFilterStep', () => {
    it('should create filter step', () => {
      const step = createFilterStep({
        predicate: (input) => input.value > 0,
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('filter');
    });

    it('should execute filter step with passing condition', async () => {
      const step = createFilterStep({
        predicate: (input) => input.value > 0,
      });
      const result = await step.execute({ value: 5 });
      expect(result).toEqual({ value: 5 });
    });

    it('should fail filter step with failing condition', async () => {
      const step = createFilterStep({
        predicate: (input) => input.value > 0,
      });
      await expect(step.execute({ value: -1 })).rejects.toThrow('Filter condition not met');
    });
  });

  describe('createDelayStep', () => {
    it('should create delay step', () => {
      const step = createDelayStep({ delayMs: 100 });
      expect(step).toBeDefined();
      expect(step.type).toBe('delay');
    });

    it('should execute delay step', async () => {
      const step = createDelayStep({ delayMs: 50 });
      const start = Date.now();
      await step.execute({ data: 'test' });
      const duration = Date.now() - start;
      expect(duration).toBeGreaterThanOrEqual(40);
    });
  });

  describe('createConditionStep', () => {
    it('should create condition step', () => {
      const step = createConditionStep({
        condition: (input) => input.value > 0,
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('condition');
    });
  });

  describe('createParallelStep', () => {
    it('should create parallel step', () => {
      const step = createParallelStep({
        steps: [
          createTransformStep({ transform: (i) => ({ ...i, a: true }) }),
          createTransformStep({ transform: (i) => ({ ...i, b: true }) }),
        ],
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('parallel');
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
  });

  describe('createAggregateStep', () => {
    it('should create aggregate step', () => {
      const step = createAggregateStep({
        aggregator: (results) => results.reduce((sum, r) => sum + r.value, 0),
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('aggregate');
    });

    it('should execute aggregate step', async () => {
      const step = createAggregateStep({
        aggregator: (results) => results.reduce((sum, r) => sum + r.value, 0),
      });
      const result = await step.execute([{ value: 1 }, { value: 2 }, { value: 3 }]);
      expect(result).toBe(6);
    });
  });

  describe('createNotifyStep', () => {
    it('should create notify step', () => {
      const step = createNotifyStep({
        notify: async (data) => { /* noop */ },
      });
      expect(step).toBeDefined();
      expect(step.type).toBe('notify');
    });

    it('should execute notify step', async () => {
      const notifyFn = vi.fn();
      const step = createNotifyStep({ notify: notifyFn });
      await step.execute({ data: 'test' });
      expect(notifyFn).toHaveBeenCalledWith({ data: 'test' });
    });
  });
});
