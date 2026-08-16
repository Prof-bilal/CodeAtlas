export interface EmailTemplate {
  name: string;
  subject: string;
  html: string;
  text?: string;
}

export const emailTemplates: Record<string, EmailTemplate> = {
  welcome: {
    name: 'welcome',
    subject: 'Welcome to Our Platform',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome!</h1>
          </div>
          <div class="content">
            <p>Hello {{name}},</p>
            <p>Welcome to our platform! We're excited to have you on board.</p>
            <p>To get started, please verify your email address by clicking the button below:</p>
            <p style="text-align: center;">
              <a href="{{verificationUrl}}" class="button">Verify Email</a>
            </p>
          </div>
          <div class="footer">
            <p>If you have any questions, please contact support@platform.com</p>
          </div>
        </div>
      </body>
      </html>
    `,
  },
  
  resetPassword: {
    name: 'resetPassword',
    subject: 'Reset Your Password',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .button { display: inline-block; background: #dc3545; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Password Reset</h1>
          </div>
          <div class="content">
            <p>Hello {{name}},</p>
            <p>We received a request to reset your password. Click the button below to reset it:</p>
            <p style="text-align: center;">
              <a href="{{resetUrl}}" class="button">Reset Password</a>
            </p>
            <p>If you didn't request this, please ignore this email.</p>
          </div>
          <div class="footer">
            <p>This link will expire in 24 hours.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  },
  
  paymentConfirmation: {
    name: 'paymentConfirmation',
    subject: 'Payment Confirmation',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #28a745; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .amount { font-size: 24px; font-weight: bold; color: #28a745; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Payment Confirmed</h1>
          </div>
          <div class="content">
            <p>Hello {{name}},</p>
            <p>Your payment has been successfully processed.</p>
            <p class="amount">\${{amount}}</p>
            <p>Transaction ID: {{transactionId}}</p>
          </div>
          <div class="footer">
            <p>Thank you for your purchase!</p>
          </div>
        </div>
      </body>
      </html>
    `,
  },
  
  subscriptionRenewal: {
    name: 'subscriptionRenewal',
    subject: 'Subscription Renewal Reminder',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Subscription Renewal</h1>
          </div>
          <div class="content">
            <p>Hello {{name}},</p>
            <p>Your subscription will renew on {{renewalDate}}.</p>
            <p>Plan: {{planName}}</p>
            <p>Amount: \${{amount}}</p>
          </div>
          <div class="footer">
            <p>To manage your subscription, visit your account settings.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  },
  
  securityAlert: {
    name: 'securityAlert',
    subject: 'Security Alert',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background: #f9f9f9; }
          .alert { background: #fff3cd; border: 1px solid #ffc107; padding: 15px; margin: 10px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Security Alert</h1>
          </div>
          <div class="content">
            <div class="alert">
              <p>{{alertMessage}}</p>
            </div>
            <p>If this wasn't you, please change your password immediately and contact support.</p>
          </div>
          <div class="footer">
            <p>This is an automated security alert.</p>
          </div>
        </div>
      </body>
      </html>
    `,
  },
};

export function renderTemplate(templateName: string, data: Record<string, string>): string {
  const template = emailTemplates[templateName];
  
  if (!template) {
    throw new Error(`Template ${templateName} not found`);
  }
  
  let html = template.html;
  
  for (const [key, value] of Object.entries(data)) {
    html = html.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }
  
  return html;
}
