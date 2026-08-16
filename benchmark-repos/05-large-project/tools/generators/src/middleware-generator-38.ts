import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MiddlewareGenerator38' });

interface Template38 { name: string; content: string; variables: Record<string, string>; }

export class WebhookMiddlewareGenerator38 {
  private templates: Template38[] = [];

  constructor(private outputDir: string) {}

  async generate(name: string, variables: Record<string, string>): Promise<string[]> {
    logger.info('Generating middleware: ' + name);
    const generated: string[] = [];
    for (const template of this.templates) {
      let content = template.content;
      for (const [key, value] of Object.entries({ ...variables, ...template.variables })) {
        content = content.replace(new RegExp('\{\{' + key + '\}\}', 'g'), value);
      }
      const fileName = template.name.replace('{name}', name);
      generated.push(fileName);
    }
    logger.info('Generated ' + generated.length + ' files');
    return generated;
  }

  addTemplate(template: Template38): void { this.templates.push(template); }
  getTemplates(): Template38[] { return [...this.templates]; }
}