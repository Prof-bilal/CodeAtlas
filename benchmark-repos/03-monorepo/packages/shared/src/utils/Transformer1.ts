export interface TransformerConfig1 {
  name: string;
  version: string;
  inputFormat: string;
  outputFormat: string;
  validation: boolean;
  compression: boolean;
  encryption: boolean;
  logging: boolean;
  metrics: boolean;
  batchSize: number;
  maxRetries: number;
  timeoutMs: number;
  schemaValidation: boolean;
  strictMode: boolean;
  customTransforms: Record<string, (value: unknown) => unknown>;
}
export interface TransformResult{N> {
  success: boolean;
  input: unknown;
  output: unknown;
  duration: number;
  errors: string[];
  warnings: string[];
  metadata: Record<string, unknown>;
}
export interface ValidationRule1 {
  field: string;
  type: string;
  required: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  min?: number;
  max?: number;
  custom?: (value: unknown) => string | null;
  message: string;
}
export interface TransformSchema1 {
  name: string;
  version: string;
  fields: Array<{ name: string; type: string; required: boolean; transformations: string[]; defaultValue?: unknown; description?: string }>;
  indexes: Array<{ fields: string[]; unique: boolean; name: string }>;
  constraints: Array<{ name: string; type: string; definition: string }>;
  metadata: Record<string, unknown>;
}
export interface BatchTransformJob1 {
  id: string;
  schemaId: string;
  inputCount: number;
  processedCount: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  startTime: Date;
  endTime?: Date;
  status: string;
  errors: Array<{ index: number; error: string; input: unknown }>;
  metrics: { avgTransformTime: number; totalTransformTime: number; throughput: number };
}
export class Transformer1 {
  private config: TransformerConfig1;
  private schemas: Map<string, TransformSchema1> = new Map();
  private jobs: Map<string, BatchTransformJob1> = new Map();
  private validationRules: Map<string, ValidationRule1[]> = new Map();
  private metrics: { totalTransforms: number; successful: number; failed: number; avgDuration: number; totalDuration: number };
  private cache: Map<string, { result: TransformResult{N>; expiresAt: Date }> = new Map();
  private transformLog: Array<{ input: unknown; output: unknown; duration: number; success: boolean; timestamp: Date }> = [];

  constructor(config: TransformerConfig1) {
    this.config = config;
    this.metrics = { totalTransforms: 0, successful: 0, failed: 0, avgDuration: 0, totalDuration: 0 };
  }

  registerSchema(schema: TransformSchema1): void {
    this.schemas.set(schema.name, schema);
  }

  addValidationRules(schemaId: string, rules: ValidationRule1[]): void {
    var existing = this.validationRules.get(schemaId) || [];
    existing.push(...rules);
    this.validationRules.set(schemaId, existing);
  }

  async transform<TInput, TOutput>(input: TInput, schemaId: string): Promise<TransformResult1> {
    var start = Date.now();
    this.metrics.totalTransforms++;

    var cacheKey = schemaId + ':' + JSON.stringify(input);
    if (this.config.validation) {
      var cached = this.cache.get(cacheKey);
      if (cached && cached.expiresAt > new Date()) {
        cached.result.duration = Date.now() - start;
        return cached.result;
      }
    }

    var errors: string[] = [];
    var warnings: string[] = [];

    var schema = this.schemas.get(schemaId);
    if (!schema) {
      errors.push('Schema not found: ' + schemaId);
      var result: TransformResult{N> = { success: false, input: input, output: null, duration: Date.now() - start, errors: errors, warnings: warnings, metadata: { schemaId: schemaId } };
      this.metrics.failed++;
      this.updateMetrics(Date.now() - start);
      return result;
    }

    if (this.config.schemaValidation) {
      var validationErrors = this.validateSchema(input, schema);
      if (validationErrors.length > 0) {
        errors.push(...validationErrors);
        var result: TransformResult{N> = { success: false, input: input, output: null, duration: Date.now() - start, errors: errors, warnings: warnings, metadata: { schemaId: schemaId } };
        this.metrics.failed++;
        this.updateMetrics(Date.now() - start);
        return result;
      }
    }

    try {
      var output = this.applyTransformations(input, schema);
      var result: TransformResult{N> = { success: true, input: input, output: output, duration: Date.now() - start, errors: errors, warnings: warnings, metadata: { schemaId: schemaId, fieldCount: schema.fields.length } };
      this.metrics.successful++;
      this.updateMetrics(Date.now() - start);
      if (this.config.validation) this.cache.set(cacheKey, { result: result, expiresAt: new Date(Date.now() + 300000) });
      this.transformLog.push({ input: input, output: output, duration: result.duration, success: true, timestamp: new Date() });
      if (this.transformLog.length > 10000) this.transformLog = this.transformLog.slice(-5000);
      return result;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      var result: TransformResult{N> = { success: false, input: input, output: null, duration: Date.now() - start, errors: errors, warnings: warnings, metadata: { schemaId: schemaId } };
      this.metrics.failed++;
      this.updateMetrics(Date.now() - start);
      this.transformLog.push({ input: input, output: null, duration: result.duration, success: false, timestamp: new Date() });
      return result;
    }
  }

  private validateSchema(input: unknown, schema: TransformSchema1): string[] {
    var errors: string[] = [];
    var rules = this.validationRules.get(schema.name) || [];
    for (var rule of rules) {
      var value = (input as Record<string, unknown>)[rule.field];
      if (rule.required && (value === undefined || value === null)) {
        errors.push(rule.message || 'Field ' + rule.field + ' is required');
        continue;
      }
      if (value !== undefined && value !== null) {
        if (rule.minLength && typeof value === 'string' && value.length < rule.minLength) errors.push('Field ' + rule.field + ' too short');
        if (rule.maxLength && typeof value === 'string' && value.length > rule.maxLength) errors.push('Field ' + rule.field + ' too long');
        if (rule.pattern && typeof value === 'string' && !new RegExp(rule.pattern).test(value)) errors.push('Field ' + rule.field + ' invalid format');
        if (rule.min !== undefined && typeof value === 'number' && value < rule.min) errors.push('Field ' + rule.field + ' too small');
        if (rule.max !== undefined && typeof value === 'number' && value > rule.max) errors.push('Field ' + rule.field + ' too large');
        if (rule.custom) { var err = rule.custom(value); if (err) errors.push(err); }
      }
    }
    return errors;
  }

  private applyTransformations<TInput>(input: TInput, schema: TransformSchema1): unknown {
    var output: Record<string, unknown> = {};
    var inputRecord = input as Record<string, unknown>;
    for (var field of schema.fields) {
      var value = inputRecord[field.name];
      if (value === undefined && field.defaultValue !== undefined) value = field.defaultValue;
      for (var transform of field.transformations) {
        value = this.applySingleTransform(value, transform);
      }
      output[field.name] = value;
    }
    return output;
  }

  private applySingleTransform(value: unknown, transform: string): unknown {
    if (this.config.customTransforms[transform]) return this.config.customTransforms[transform](value);
    switch (transform) {
      case 'toUpperCase': return typeof value === 'string' ? value.toUpperCase() : value;
      case 'toLowerCase': return typeof value === 'string' ? value.toLowerCase() : value;
      case 'trim': return typeof value === 'string' ? value.trim() : value;
      case 'toString': return String(value);
      case 'toNumber': return Number(value);
      case 'toBoolean': return Boolean(value);
      case 'toArray': return Array.isArray(value) ? value : [value];
      case 'toJson': return JSON.stringify(value);
      case 'fromJson': return typeof value === 'string' ? JSON.parse(value) : value;
      case 'flatten': return typeof value === 'object' && value !== null ? Object.assign({}, value as Record<string, unknown>) : value;
      case 'unique': return Array.isArray(value) ? [...new Set(value)] : value;
      case 'sort': return Array.isArray(value) ? [...value].sort() : value;
      case 'reverse': return Array.isArray(value) ? [...value].reverse() : value;
      case 'compact': return Array.isArray(value) ? value.filter(Boolean) : value;
      case 'default': return value || null;
      case 'uuid': return crypto.randomUUID();
      case 'timestamp': return new Date().toISOString();
      case 'hash': return crypto.createHash('sha256').update(String(value)).digest('hex');
      default: return value;
    }
  }

  private updateMetrics(duration: number): void {
    this.metrics.totalDuration += duration;
    this.metrics.avgDuration = this.metrics.totalDuration / this.metrics.totalTransforms;
  }

  async batchTransform(inputs: unknown[], schemaId: string): Promise<BatchTransformJob1> {
    var jobId = crypto.randomUUID();
    var job: BatchTransformJob{N> = {
      id: jobId, schemaId: schemaId, inputCount: inputs.length, processedCount: 0,
      successCount: 0, errorCount: 0, skippedCount: 0, startTime: new Date(), status: 'running',
      errors: [], metrics: { avgTransformTime: 0, totalTransformTime: 0, throughput: 0 },
    };
    this.jobs.set(jobId, job);
    var totalDuration = 0;
    for (var i = 0; i < inputs.length; i++) {
      var start = Date.now();
      var result = await this.transform(inputs[i], schemaId);
      var duration = Date.now() - start;
      totalDuration += duration;
      job.processedCount++;
      if (result.success) job.successCount++;
      else { job.errorCount++; job.errors.push({ index: i, error: result.errors.join(', '), input: inputs[i] }); }
    }
    job.endTime = new Date();
    job.status = 'completed';
    job.metrics.avgTransformTime = totalDuration / inputs.length;
    job.metrics.totalTransformTime = totalDuration;
    job.metrics.throughput = inputs.length / (totalDuration / 1000);
    return job;
  }

  getJob(jobId: string): BatchTransformJob1 | undefined { return this.jobs.get(jobId); }
  getSchemas(): TransformSchema1[] { return Array.from(this.schemas.values()); }
  getMetrics(): { totalTransforms: number; successful: number; failed: number; avgDuration: number; totalDuration: number } { return Object.assign({}, this.metrics); }
  getTransformLog(limit: number = 100): Array<{ input: unknown; output: unknown; duration: number; success: boolean; timestamp: Date }> { return this.transformLog.slice(-limit); }
  clearCache(): void { this.cache.clear(); }
  destroy(): void { this.schemas.clear(); this.jobs.clear(); this.validationRules.clear(); this.cache.clear(); this.transformLog = []; }
}
export function createTransformer1(config: TransformerConfig1): Transformer1 { return new Transformer1(config); }
export function getDefaultTransformerConfig1(): TransformerConfig{N> {
  return { name: 'Transformer1', version: '1.0.0', inputFormat: 'json', outputFormat: 'json', validation: true, compression: false, encryption: false, logging: true, metrics: true, batchSize: 100, maxRetries: 3, timeoutMs: 5000, schemaValidation: true, strictMode: false, customTransforms: {} };
}