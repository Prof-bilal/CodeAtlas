import { describe, it, expect } from 'vitest';
import { renderTemplate, emailTemplates } from '../src/core/notifications/emailTemplates.js';

describe('Email Templates', () => {
  it('should have welcome template', () => {
    expect(emailTemplates.welcome).toBeDefined();
    expect(emailTemplates.welcome.subject).toBe('Welcome to Our Platform');
  });

  it('should have reset password template', () => {
    expect(emailTemplates.resetPassword).toBeDefined();
    expect(emailTemplates.resetPassword.subject).toBe('Reset Your Password');
  });

  it('should have payment confirmation template', () => {
    expect(emailTemplates.paymentConfirmation).toBeDefined();
    expect(emailTemplates.paymentConfirmation.subject).toBe('Payment Confirmation');
  });

  it('should have subscription renewal template', () => {
    expect(emailTemplates.subscriptionRenewal).toBeDefined();
    expect(emailTemplates.subscriptionRenewal.subject).toBe('Subscription Renewal Reminder');
  });

  it('should have security alert template', () => {
    expect(emailTemplates.securityAlert).toBeDefined();
    expect(emailTemplates.securityAlert.subject).toBe('Security Alert');
  });

  describe('renderTemplate', () => {
    it('should render template with data', () => {
      const html = renderTemplate('welcome', {
        name: 'John',
        verificationUrl: 'https://example.com/verify',
      });

      expect(html).toContain('John');
      expect(html).toContain('https://example.com/verify');
    });

    it('should throw error for non-existent template', () => {
      expect(() => renderTemplate('non-existent', {})).toThrow('Template non-existent not found');
    });
  });
});
