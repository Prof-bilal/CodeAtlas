import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MiddlewareGenerator27' });

interface Template27 { name: string; content: string; variables: Record<string, string>; }

export class NotificationMiddlewareGenerator27 {
  private templates: Template27[] = [];

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

  addTemplate(template: Template27): void { this.templates.push(template); }
  getTemplates(): Template27[] { return [...this.templates]; }
}