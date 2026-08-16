// Email service - CURRENT

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export class EmailService {
  private from: string;

  constructor(from: string = 'noreply@example.com') {
    this.from = from;
  }

  async send(options: EmailOptions): Promise<boolean> {
    console.log(Email sent to : );
    return true;
  }

  async sendBulk(emails: EmailOptions[]): Promise<number> {
    let sent = 0;
    for (const email of emails) {
      if (await this.send(email)) sent++;
    }
    return sent;
  }
}
