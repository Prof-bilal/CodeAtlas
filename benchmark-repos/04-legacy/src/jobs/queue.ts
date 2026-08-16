// Job definitions - OLD
// DEPRECATED - use proper job queue

export interface Job {
  id: string;
  type: string;
  data: any;
  status: 'pending' | 'running' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
}

export class JobQueue {
  private jobs: Job[] = [];

  add(type: string, data: any): Job {
    const job: Job = {
      id: job_,
      type,
      data,
      status: 'pending',
      createdAt: new Date(),
    };
    this.jobs.push(job);
    return job;
  }

  getPending(): Job[] {
    return this.jobs.filter(j => j.status === 'pending');
  }

  updateStatus(id: string, status: Job['status']) {
    const job = this.jobs.find(j => j.id === id);
    if (job) {
      job.status = status;
      if (status === 'completed') job.completedAt = new Date();
    }
  }
}
