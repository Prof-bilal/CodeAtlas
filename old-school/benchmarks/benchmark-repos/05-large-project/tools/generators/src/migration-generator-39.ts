import { Logger } from '@atlas/shared';

const logger = new Logger({ context: 'MigrationGenerator39' });

interface Template39 { name: string; content: string; variables: Record<string, string>; }

export class IssueMigrationGenerator39 {
  private templates: Template39[] = [];

  constructor(private outputDir: string) {}

  async generate(name: string, variables: Record<string, string>): Promise<string[]> {
    logger.info('Generating migration: ' + name);
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

  addTemplate(template: Template39): void { this.templates.push(template); }
  getTemplates(): Template39[] { return [...this.templates]; }
}