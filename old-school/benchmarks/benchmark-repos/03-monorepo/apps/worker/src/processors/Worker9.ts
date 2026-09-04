export interface WorkerConfig9 {
  name: string;
  concurrency: number;
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier: number;
  maxRetryDelayMs: number;
  timeoutMs: number;
  deadLetterEnabled: boolean;
  metricsEnabled: boolean;
  heartbeatIntervalMs: number;
  jobTimeoutMs: number;
  maxJobsPerBatch: number;
  pollingIntervalMs: number;
  shutdownTimeoutMs: number;
  enableProgress: boolean;
  progressUpdateIntervalMs: number;
}
export interface WorkerJob9 {
  id: string;
  type: string;
  data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  attempts: number;
  maxAttempts: number;
  priority: number;
  delay: number;
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  tags: string[];
  progress?: { current: number; total: number; percent: number; message: string };
  timeout?: number;
  rateLimit?: { key: string; maxPerSecond: number };
  deduplication?: { key: string; ttlMs: number };
  callbacks?: { onStart?: string; onComplete?: string; onProgress?: string; onError?: string };
}
export interface WorkerResult9 {
  success: boolean;
  output?: unknown;
  error?: string;
  duration: number;
  retryable: boolean;
  metadata: Record<string, unknown>;
  progress?: { current: number; total: number; percent: number; message: string };
}
export interface WorkerMetrics9 {
  processed: number;
  succeeded: number;
  failed: number;
  retried: number;
  avgProcessingTimeMs: number;
  maxProcessingTimeMs: number;
  minProcessingTimeMs: number;
  p95ProcessingTimeMs: number;
  p99ProcessingTimeMs: number;
  throughputPerSecond: number;
  memoryUsageBytes: number;
  activeWorkers: number;
  queueDepth: number;
  deadLetterSize: number;
}
export interface WorkerState9 {
  running: boolean;
  startedAt: Date | null;
  stoppedAt: Date | null;
  activeJobs: number;
  completedJobs: number;
  failedJobs: number;
  totalProcessingTimeMs: number;
  lastHeartbeat: Date | null;
  healthStatus: string;
}
export class Worker9 {
  private config: WorkerConfig9;
  private state: WorkerState9;
  private jobs: Map<string, WorkerJob9> = new Map();
  private results: Map<string, WorkerResult9> = new Map();
  private deadLetter: WorkerJob9[] = [];
  private processingTimes: number[] = [];
  private metrics: WorkerMetrics9;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  private processors: Map<string, (job: WorkerJob9) => Promise<unknown>> = new Map();
  private middleware: Array<{ name: string; handler: (job: WorkerJob9) => Promise<WorkerJob9> }> = [];
  private progressCallbacks: Map<string, (progress: { current: number; total: number; percent: number; message: string }) => void> = new Map();
  private rateLimiters: Map<string, { count: number; windowStart: Date; maxPerSecond: number }> = new Map();
  private deduplicationCache: Map<string, { key: string; expiresAt: Date }> = new Map();

  constructor(config: WorkerConfig9) {
    this.config = config;
    this.state = { running: false, startedAt: null, stoppedAt: null, activeJobs: 0, completedJobs: 0, failedJobs: 0, totalProcessingTimeMs: 0, lastHeartbeat: null, healthStatus: 'unknown' };
    this.metrics = { processed: 0, succeeded: 0, failed: 0, retried: 0, avgProcessingTimeMs: 0, maxProcessingTimeMs: 0, minProcessingTimeMs: Infinity, p95ProcessingTimeMs: 0, p99ProcessingTimeMs: 0, throughputPerSecond: 0, memoryUsageBytes: 0, activeWorkers: 0, queueDepth: 0, deadLetterSize: 0 };
  }

  registerProcessor(type: string, processor: (job: WorkerJob9) => Promise<unknown>): void {
    this.processors.set(type, processor);
  }

  addMiddleware(name: string, handler: (job: WorkerJob9) => Promise<WorkerJob9>): void {
    this.middleware.push({ name: name, handler: handler });
  }

  async start(): Promise<void> {
    if (this.state.running) return;
    this.log('info', 'Starting worker');
    this.state.running = true;
    this.state.startedAt = new Date();
    this.heartbeatTimer = setInterval(function() { this.sendHeartbeat(); }.bind(this), this.config.heartbeatIntervalMs);
    this.pollingTimer = setInterval(function() { this.pollJobs(); }.bind(this), this.config.pollingIntervalMs);
    this.log('info', 'Worker started');
  }

  async stop(): Promise<void> {
    if (!this.state.running) return;
    this.log('info', 'Stopping worker');
    this.state.running = false;
    this.state.stoppedAt = new Date();
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    this.shutdownTimer = setTimeout(function() {
      this.log('warn', 'Shutdown timeout reached, forcing exit');
      process.exit(1);
    }.bind(this), this.config.shutdownTimeoutMs);
    await this.drainJobs();
    if (this.shutdownTimer) clearTimeout(this.shutdownTimer);
    this.log('info', 'Worker stopped');
  }

  async addJob(job: Omit<WorkerJob9, 'id' | 'createdAt' | 'attempts'>): Promise<string> {
    var id = crypto.randomUUID();
    var fullJob: WorkerJob9 = { id: id, type: job.type, data: job.data, metadata: job.metadata || {}, attempts: 0, maxAttempts: job.maxAttempts || this.config.maxRetries, priority: job.priority || 0, delay: job.delay || 0, createdAt: new Date(), tags: job.tags || [] };
    if (job.deduplication) {
      var existing = this.deduplicationCache.get(job.deduplication.key);
      if (existing && existing.expiresAt > new Date()) return existing.key;
      this.deduplicationCache.set(job.deduplication.key, { key: id, expiresAt: new Date(Date.now() + job.deduplication.ttlMs) });
    }
    this.jobs.set(id, fullJob);
    return id;
  }

  async cancelJob(jobId: string): Promise<boolean> {
    var job = this.jobs.get(jobId);
    if (!job) return false;
    this.jobs.delete(jobId);
    return true;
  }

  async processJob(job: WorkerJob9): Promise<WorkerResult9> {
    var start = Date.now();
    job.processedAt = new Date();
    this.state.activeJobs++;

    if (job.rateLimit) {
      var limiter = this.rateLimiters.get(job.rateLimit.key);
      if (!limiter || Date.now() - limiter.windowStart.getTime() > 1000) {
        limiter = { count: 0, windowStart: new Date(), maxPerSecond: job.rateLimit.maxPerSecond };
        this.rateLimiters.set(job.rateLimit.key, limiter);
      }
      limiter.count++;
      if (limiter.count > limiter.maxPerSecond) {
        this.state.activeJobs--;
        return { success: false, error: 'Rate limit exceeded', duration: Date.now() - start, retryable: true, metadata: {} };
      }
    }

    for (var mw of this.middleware) {
      try { job = await mw.handler(job); } catch (error) {
        this.state.activeJobs--;
        return { success: false, error: 'Middleware ' + mw.name + ' failed: ' + (error instanceof Error ? error.message : 'Unknown'), duration: Date.now() - start, retryable: false, metadata: {} };
      }
    }

    var processor = this.processors.get(job.type);
    if (!processor) {
      this.state.activeJobs--;
      return { success: false, error: 'No processor for type: ' + job.type, duration: Date.now() - start, retryable: false, metadata: {} };
    }

    try {
      var output = await this.executeWithTimeout(processor, job, job.timeout || this.config.jobTimeoutMs);
      var duration = Date.now() - start;
      this.state.activeJobs--;
      this.state.completedJobs++;
      this.state.totalProcessingTimeMs += duration;
      this.metrics.processed++;
      this.metrics.succeeded++;
      this.updateProcessingTimeStats(duration);
      job.completedAt = new Date();
      var result: WorkerResult9 = { success: true, output: output, duration: duration, retryable: false, metadata: { processor: job.type, attempt: job.attempts } };
      this.results.set(job.id, result);
      return result;
    } catch (error) {
      var duration = Date.now() - start;
      this.state.activeJobs--;
      this.state.failedJobs++;
      this.metrics.processed++;
      this.metrics.failed++;
      this.updateProcessingTimeStats(duration);
      job.failedAt = new Date();
      job.error = error instanceof Error ? error.message : 'Unknown';
      if (job.attempts < job.maxAttempts && this.isRetryable(error)) {
        job.attempts++;
        this.metrics.retried++;
        var delay = Math.min(this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, job.attempts - 1), this.config.maxRetryDelayMs);
        var retryJob = Object.assign({}, job, { delay: delay, attempts: job.attempts });
        this.jobs.set(job.id, retryJob);
        return { success: false, error: job.error, duration: duration, retryable: true, metadata: { attempt: job.attempts, nextRetryAt: new Date(Date.now() + delay).toISOString() } };
      }
      if (this.config.deadLetterEnabled) { this.deadLetter.push(job); this.metrics.deadLetterSize = this.deadLetter.length; }
      return { success: false, error: job.error, duration: duration, retryable: false, metadata: { attempts: job.attempts } };
    }
  }

  private async executeWithTimeout<T>(fn: (job: WorkerJob9) => Promise<T>, job: WorkerJob9, timeoutMs: number): Promise<T> {
    return new Promise(function(resolve, reject) {
      var timer = setTimeout(function() { reject(new Error('Job execution timed out after ' + timeoutMs + 'ms')); }, timeoutMs);
      fn(job).then(function(result) { clearTimeout(timer); resolve(result); }).catch(function(error) { clearTimeout(timer); reject(error); });
    });
  }

  private isRetryable(error: unknown): boolean {
    if (error instanceof Error) {
      var message = error.message.toLowerCase();
      return message.includes('timeout') || message.includes('network') || message.includes('connection');
    }
    return true;
  }

  private updateProcessingTimeStats(duration: number): void {
    this.processingTimes.push(duration);
    if (this.processingTimes.length > 10000) this.processingTimes = this.processingTimes.slice(-5000);
    this.metrics.avgProcessingTimeMs = this.processingTimes.reduce(function(a, b) { return a + b; }, 0) / this.processingTimes.length;
    this.metrics.maxProcessingTimeMs = Math.max(this.metrics.maxProcessingTimeMs, duration);
    this.metrics.minProcessingTimeMs = Math.min(this.metrics.minProcessingTimeMs, duration);
    var sorted = this.processingTimes.slice().sort(function(a, b) { return a - b; });
    this.metrics.p95ProcessingTimeMs = sorted[Math.floor(sorted.length * 0.95)] || 0;
    this.metrics.p99ProcessingTimeMs = sorted[Math.floor(sorted.length * 0.99)] || 0;
  }

  private async pollJobs(): Promise<void> {
    var pendingJobs = Array.from(this.jobs.values()).filter(function(j) { return !j.processedAt && j.delay <= 0; }).sort(function(a, b) { return b.priority - a.priority; }).slice(0, this.config.maxJobsPerBatch);
    for (var job of pendingJobs) {
      this.processJob(job);
    }
  }

  private async drainJobs(): Promise<void> {
    var activeJobs = Array.from(this.jobs.values()).filter(function(j) { return j.processedAt && !j.completedAt && !j.failedAt; });
    for (var job of activeJobs) {
      await this.processJob(job);
    }
  }

  private sendHeartbeat(): void {
    this.state.lastHeartbeat = new Date();
    this.metrics.memoryUsageBytes = process.memoryUsage().heapUsed;
    this.metrics.activeWorkers = this.config.concurrency;
    this.metrics.queueDepth = this.jobs.size;
  }

  private log(level: string, message: string, context: Record<string, unknown> = {}): void {
    console.log('[' + level.toUpperCase() + '] [' + this.config.name + '] ' + message, JSON.stringify(context));
  }

  getMetrics(): WorkerMetrics{N> { return Object.assign({}, this.metrics); }
  getState(): WorkerState9 { return Object.assign({}, this.state); }
  getConfig(): WorkerConfig9 { return Object.assign({}, this.config); }
  getResult(jobId: string): WorkerResult9 | undefined { return this.results.get(jobId); }
  getJob(jobId: string): WorkerJob9 | undefined { return this.jobs.get(jobId); }
  getQueueLength(): number { return this.jobs.size; }
  getDeadLetterSize(): number { return this.deadLetter.length; }
  clearDeadLetter(): void { this.deadLetter = []; this.metrics.deadLetterSize = 0; }
  destroy(): void { this.stop(); this.jobs.clear(); this.results.clear(); this.deadLetter = []; this.processors.clear(); this.middleware = []; }
}
export function createWorker9(config: WorkerConfig9): Worker9 { return new Worker9(config); }
export function getDefaultWorkerConfig9(): WorkerConfig9 {
  return { name: 'Worker9', concurrency: 5, maxRetries: 3, retryDelayMs: 1000, backoffMultiplier: 2, maxRetryDelayMs: 30000, timeoutMs: 30000, deadLetterEnabled: true, metricsEnabled: true, heartbeatIntervalMs: 30000, jobTimeoutMs: 60000, maxJobsPerBatch: 10, pollingIntervalMs: 1000, shutdownTimeoutMs: 30000, enableProgress: true, progressUpdateIntervalMs: 5000 };
}