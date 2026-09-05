export interface Job<T = any> {
  id: string;
  type: string;
  data: T;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  processedAt?: Date;
  completedAt?: Date;
  error?: string;
  attempts: number;
  maxAttempts: number;
}

export type JobProcessor<T = any> = (job: Job<T>) => Promise<void>;

export class JobQueue {
  private jobs: Job[] = [];
  private processors: Map<string, JobProcessor> = new Map();
  private processing: boolean = false;
  private interval: NodeJS.Timeout | null = null;

  registerProcessor<T>(type: string, processor: JobProcessor<T>): void {
    this.processors.set(type, processor as JobProcessor);
  }

  async addJob<T>(type: string, data: T, options: { maxAttempts?: number } = {}): Promise<Job<T>> {
    const job: Job<T> = {
      id: `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      type,
      data,
      status: 'pending',
      createdAt: new Date(),
      attempts: 0,
      maxAttempts: options.maxAttempts || 3,
    };
    
    this.jobs.push(job);
    return job;
  }

  async processNext(): Promise<void> {
    const pendingJob = this.jobs.find(job => job.status === 'pending');
    
    if (!pendingJob) {
      return;
    }
    
    const processor = this.processors.get(pendingJob.type);
    
    if (!processor) {
      pendingJob.status = 'failed';
      pendingJob.error = 'No processor registered for job type';
      return;
    }
    
    pendingJob.status = 'processing';
    pendingJob.processedAt = new Date();
    pendingJob.attempts++;
    
    try {
      await processor(pendingJob);
      pendingJob.status = 'completed';
      pendingJob.completedAt = new Date();
    } catch (error) {
      if (pendingJob.attempts >= pendingJob.maxAttempts) {
        pendingJob.status = 'failed';
        pendingJob.error = error instanceof Error ? error.message : 'Unknown error';
      } else {
        pendingJob.status = 'pending';
        pendingJob.processedAt = undefined;
      }
    }
  }

  getJob(id: string): Job | undefined {
    return this.jobs.find(job => job.id === id);
  }

  getJobs(status?: Job['status']): Job[] {
    if (status) {
      return this.jobs.filter(job => job.status === status);
    }
    return [...this.jobs];
  }

  getStats(): {
    total: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
  } {
    return {
      total: this.jobs.length,
      pending: this.jobs.filter(j => j.status === 'pending').length,
      processing: this.jobs.filter(j => j.status === 'processing').length,
      completed: this.jobs.filter(j => j.status === 'completed').length,
      failed: this.jobs.filter(j => j.status === 'failed').length,
    };
  }

  clear(): void {
    this.jobs = [];
  }
}

export const jobQueue = new JobQueue();
