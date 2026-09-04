import { WorkflowStep } from './workflowEngine.js';
import { logger } from '../../utils/logger.js';

export function createHttpStep(config: {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}): WorkflowStep {
  return {
    id: `http-${Date.now()}`,
    type: 'http',
    name: `HTTP Request to ${config.url}`,
    config,
    execute: async (input: any) => {
      logger.info(`Executing HTTP request to ${config.url}`);
      
      const response = await fetch(config.url, {
        method: config.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...config.headers,
        },
        body: config.body ? JSON.stringify(config.body) : undefined,
      });

      if (!response.ok) {
        throw new Error(`HTTP request failed with status ${response.status}`);
      }

      return response.json();
    },
  };
}

export function createTransformStep(config: {
  transform: (input: any) => any;
}): WorkflowStep {
  return {
    id: `transform-${Date.now()}`,
    type: 'transform',
    name: 'Transform Data',
    config,
    execute: async (input: any) => {
      logger.info('Executing transform step');
      return config.transform(input);
    },
  };
}

export function createFilterStep(config: {
  predicate: (input: any) => boolean;
}): WorkflowStep {
  return {
    id: `filter-${Date.now()}`,
    type: 'filter',
    name: 'Filter Data',
    config,
    execute: async (input: any) => {
      logger.info('Executing filter step');
      if (!config.predicate(input)) {
        throw new Error('Filter condition not met');
      }
      return input;
    },
  };
}

export function createDelayStep(config: {
  delayMs: number;
}): WorkflowStep {
  return {
    id: `delay-${Date.now()}`,
    type: 'delay',
    name: `Delay ${config.delayMs}ms`,
    config,
    execute: async (input: any) => {
      logger.info(`Executing delay step: ${config.delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, config.delayMs));
      return input;
    },
  };
}

export function createConditionStep(config: {
  condition: (input: any) => boolean;
  trueStep?: WorkflowStep;
  falseStep?: WorkflowStep;
}): WorkflowStep {
  return {
    id: `condition-${Date.now()}`,
    type: 'condition',
    name: 'Conditional Step',
    config,
    execute: async (input: any) => {
      logger.info('Executing condition step');
      const result = config.condition(input);
      
      if (result && config.trueStep) {
        return config.trueStep.execute(input);
      } else if (!result && config.falseStep) {
        return config.falseStep.execute(input);
      }
      
      return input;
    },
  };
}

export function createParallelStep(config: {
  steps: WorkflowStep[];
}): WorkflowStep {
  return {
    id: `parallel-${Date.now()}`,
    type: 'parallel',
    name: 'Parallel Execution',
    config,
    execute: async (input: any) => {
      logger.info('Executing parallel step');
      const results = await Promise.all(
        config.steps.map(step => step.execute(input))
      );
      return results;
    },
  };
}

export function createAggregateStep(config: {
  aggregator: (results: any[]) => any;
}): WorkflowStep {
  return {
    id: `aggregate-${Date.now()}`,
    type: 'aggregate',
    name: 'Aggregate Results',
    config,
    execute: async (input: any) => {
      logger.info('Executing aggregate step');
      if (!Array.isArray(input)) {
        throw new Error('Input must be an array for aggregation');
      }
      return config.aggregator(input);
    },
  };
}

export function createNotifyStep(config: {
  notify: (data: any) => Promise<void>;
}): WorkflowStep {
  return {
    id: `notify-${Date.now()}`,
    type: 'notify',
    name: 'Send Notification',
    config,
    execute: async (input: any) => {
      logger.info('Executing notification step');
      await config.notify(input);
      return input;
    },
  };
}
