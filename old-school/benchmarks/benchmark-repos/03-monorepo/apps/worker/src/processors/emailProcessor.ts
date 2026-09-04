export interface EmailJob {
  id: string;
  to: string;
  subject: string;
  html: string;
  from?: string;
  replyTo?: string;
  template?: string;
  templateData?: Record<string, unknown>;
  priority: 'high' | 'normal' | 'low';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
}

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
}

export class EmailProcessor {
  private templates: Map<string, EmailTemplate> = new Map();
  private sentEmails: EmailJob[] = [];
  private failedEmails: EmailJob[] = [];

  constructor() {
    this.registerDefaultTemplates();
  }

  private registerDefaultTemplates(): void {
    this.registerTemplate({
      name: 'welcome',
      subject: 'Welcome to {{appName}}!',
      html: '<h1>Welcome, {{name}}!</h1><p>Thank you for joining {{appName}}.</p>',
    });
    this.registerTemplate({
      name: 'password-reset',
      subject: 'Password Reset Request',
      html: '<h1>Password Reset</h1><p>Click <a href="{{resetUrl}}">here</a> to reset your password.</p>',
    });
    this.registerTemplate({
      name: 'task-assigned',
      subject: 'You have been assigned a task',
      html: '<h1>Task Assigned</h1><p>You have been assigned to {{taskTitle}}.</p>',
    });
  }

  registerTemplate(template: EmailTemplate): void {
    this.templates.set(template.name, template);
  }

  async processJob(job: EmailJob): Promise<EmailResult> {
    try {
      let html = job.html;
      let subject = job.subject;
      if (job.template) {
        const template = this.templates.get(job.template);
        if (template) {
          html = this.renderTemplate(template.html, job.templateData || {});
          subject = this.renderTemplate(template.subject, job.templateData || {});
        }
      }
      console.log(`Sending email to ${job.to}: ${subject}`);
      await new Promise(resolve => setTimeout(resolve, 100));
      const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      this.sentEmails.push({ ...job, html, subject });
      return { success: true, messageId };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.failedEmails.push(job);
      return { success: false, error: errorMessage };
    }
  }

  private renderTemplate(template: string, data: Record<string, unknown>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return String(data[key] || `{{${key}}}`);
    });
  }

  async sendBulk(jobs: EmailJob[]): Promise<EmailResult[]> {
    const results: EmailResult[] = [];
    for (const job of jobs) {
      results.push(await this.processJob(job));
    }
    return results;
  }

  getSentEmails(): EmailJob[] {
    return [...this.sentEmails];
  }

  getFailedEmails(): EmailJob[] {
    return [...this.failedEmails];
  }

  getStats() {
    return {
      sent: this.sentEmails.length,
      failed: this.failedEmails.length,
      templates: this.templates.size,
    };
  }

  retryFailed(): Promise<EmailResult[]> {
    const jobs = [...this.failedEmails];
    this.failedEmails = [];
    return this.sendBulk(jobs);
  }
}

export function createEmailProcessor(): EmailProcessor {
  return new EmailProcessor();
}
