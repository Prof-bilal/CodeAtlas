export type EmailTemplate = (title: string, message: string, data?: Record<string, any>) => string;

export const templates: Record<string, EmailTemplate> = {
  system: (title, message) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #007bff; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
        </div>
        <div class="footer">
          <p>This is an automated message from Production API.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  payment: (title, message, data) => `
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
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
          ${data?.amount ? `<p class="amount">$${(data.amount / 100).toFixed(2)}</p>` : ''}
          ${data?.status ? `<p>Status: <strong>${data.status}</strong></p>` : ''}
        </div>
        <div class="footer">
          <p>If you have questions, contact support@production-api.com</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  task: (title, message, data) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #ffc107; color: #333; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .priority-high { color: #dc3545; }
        .priority-urgent { color: #dc3545; font-weight: bold; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
          ${data?.priority ? `<p class="priority-${data.priority}">Priority: ${data.priority}</p>` : ''}
          ${data?.dueDate ? `<p>Due: ${new Date(data.dueDate).toLocaleDateString()}</p>` : ''}
        </div>
        <div class="footer">
          <p>Log in to view task details.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  security: (title, message) => `
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
          <h1>⚠️ ${title}</h1>
        </div>
        <div class="content">
          <div class="alert">
            <p>${message}</p>
          </div>
          <p>If this wasn't you, please change your password immediately and contact support.</p>
        </div>
        <div class="footer">
          <p>This is a security alert from Production API.</p>
        </div>
      </div>
    </body>
    </html>
  `,
  
  marketing: (title, message) => `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #6f42c1; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .cta { display: inline-block; background: #6f42c1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>${title}</h1>
        </div>
        <div class="content">
          <p>${message}</p>
        </div>
        <div class="footer">
          <p>You received this email because you're a valued user.</p>
          <p><a href="#">Unsubscribe</a></p>
        </div>
      </div>
    </body>
    </html>
  `,
};
