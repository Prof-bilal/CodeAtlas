// Notification service - OLD
// DEPRECATED

export class NotificationService {
  async sendEmail(to: string, subject: string, body: string): Promise<void> {
    console.log(Email to : );
  }

  async sendSms(to: string, message: string): Promise<void> {
    console.log(SMS to : );
  }

  async sendPush(userId: string, title: string, body: string): Promise<void> {
    console.log(Push to : );
  }
}
