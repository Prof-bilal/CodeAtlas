import { describe, it, expect } from 'vitest';
import { templates, EmailTemplate } from '../src/core/notifications/templates.js';

describe('Email Templates', () => {
  describe('system template', () => {
    it('should generate system email', () => {
      const template = templates.system;
      const html = template('System Update', 'Your account has been updated.');
      
      expect(html).toContain('System Update');
      expect(html).toContain('Your account has been updated.');
      expect(html).toContain('automated message');
    });
  });

  describe('payment template', () => {
    it('should generate payment email', () => {
      const template = templates.payment;
      const html = template('Payment Received', 'Your payment was successful.', { amount: 1000 });
      
      expect(html).toContain('Payment Received');
      expect(html).toContain('Your payment was successful.');
      expect(html).toContain('$10.00');
    });
  });

  describe('task template', () => {
    it('should generate task email', () => {
      const template = templates.task;
      const html = template('Task Assigned', 'You have been assigned a new task.', { 
        priority: 'high',
        dueDate: '2024-12-31'
      });
      
      expect(html).toContain('Task Assigned');
      expect(html).toContain('You have been assigned a new task.');
      expect(html).toContain('high');
    });
  });

  describe('security template', () => {
    it('should generate security email', () => {
      const template = templates.security;
      const html = template('Security Alert', 'Suspicious login detected.');
      
      expect(html).toContain('Security Alert');
      expect(html).toContain('Suspicious login detected.');
      expect(html).toContain('security alert');
    });
  });

  describe('marketing template', () => {
    it('should generate marketing email', () => {
      const template = templates.marketing;
      const html = template('Special Offer', 'Check out our new features!');
      
      expect(html).toContain('Special Offer');
      expect(html).toContain('Check out our new features!');
      expect(html).toContain('Unsubscribe');
    });
  });
});
