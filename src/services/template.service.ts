import { logger } from '../utils/logger/logger.service.js';

export interface TemplateVariables {
  title: string;
  link: string;
  description?: string;
  author?: string;
  pubDate?: string;
  feedName: string;
  categories?: string[];
}

export interface TemplateValidationError {
  field: string;
  message: string;
}

export class TemplateService {
  private static readonly DEFAULT_TEMPLATE =
    `🔗 **{{title}}**\n\n{{description}}\n\n[Read more]({{link}})`;

  private static readonly AVAILABLE_VARIABLES = [
    'title',
    'link',
    'description',
    'author',
    'pubDate',
    'feedName',
    'categories',
  ];

  private static readonly MAX_TEMPLATE_LENGTH = 1000;

  /**
   * Render a template with provided variables
   */
  static renderTemplate(template: string | null, variables: TemplateVariables): string {
    try {
      const templateToUse = template || this.DEFAULT_TEMPLATE;

      // Replace variables in the template
      let rendered = templateToUse;

      // Replace simple variables
      rendered = rendered.replace(/\{\{title\}\}/g, this.escapeMarkdown(variables.title));
      rendered = rendered.replace(/\{\{link\}\}/g, variables.link);
      rendered = rendered.replace(
        /\{\{description\}\}/g,
        this.escapeMarkdown(variables.description || '')
      );
      rendered = rendered.replace(/\{\{author\}\}/g, this.escapeMarkdown(variables.author || ''));
      rendered = rendered.replace(/\{\{pubDate\}\}/g, variables.pubDate || '');
      rendered = rendered.replace(/\{\{feedName\}\}/g, this.escapeMarkdown(variables.feedName));

      // Handle categories array
      const categoriesText = variables.categories?.join(', ') || '';
      rendered = rendered.replace(/\{\{categories\}\}/g, this.escapeMarkdown(categoriesText));

      // Clean up any remaining empty lines or extra whitespace
      rendered = rendered.replace(/\n\s*\n\s*\n/g, '\n\n'); // Remove triple+ newlines
      rendered = rendered.trim();

      return rendered;
    } catch (error) {
      logger.error('Template rendering error', { error, template, variables });
      // Fallback to default template if rendering fails
      return this.renderTemplate(null, variables);
    }
  }

  /**
   * Validate a template string
   */
  static validateTemplate(template: string): TemplateValidationError[] {
    const errors: TemplateValidationError[] = [];

    // Check template length
    if (template.length > this.MAX_TEMPLATE_LENGTH) {
      errors.push({
        field: 'template',
        message: `Template must be no longer than ${this.MAX_TEMPLATE_LENGTH} characters`,
      });
    }

    // Check for required variables
    if (!template.includes('{{title}}') && !template.includes('{{link}}')) {
      errors.push({
        field: 'template',
        message: 'Template must include at least {{title}} or {{link}} variable',
      });
    }

    // Check for invalid variables
    const variableMatches = template.match(/\{\{([^}]+)\}\}/g);
    if (variableMatches) {
      for (const match of variableMatches) {
        const variableName = match.replace(/[{}]/g, '');
        if (!this.AVAILABLE_VARIABLES.includes(variableName)) {
          errors.push({
            field: 'template',
            message: `Unknown variable: {{${variableName}}}. Available variables: ${this.AVAILABLE_VARIABLES.map((v) => `{{${v}}}`).join(', ')}`,
          });
        }
      }
    }

    // Check for malformed variables
    const malformedMatches = template.match(/\{[^{]|[^}]\}/g);
    if (malformedMatches) {
      errors.push({
        field: 'template',
        message: 'Template contains malformed variables. Use {{variableName}} format',
      });
    }

    return errors;
  }

  /**
   * Get the default template
   */
  static getDefaultTemplate(): string {
    return this.DEFAULT_TEMPLATE;
  }

  /**
   * Get available template variables with descriptions
   */
  static getAvailableVariables(): Array<{ name: string; description: string; example: string }> {
    return [
      {
        name: 'title',
        description: 'The title of the RSS item',
        example: 'Breaking News: Important Update',
      },
      {
        name: 'link',
        description: 'The URL link to the full article',
        example: 'https://example.com/article',
      },
      {
        name: 'description',
        description: 'The description or summary of the item',
        example: 'This is a brief summary of the article content...',
      },
      {
        name: 'author',
        description: 'The author of the article',
        example: 'John Doe',
      },
      {
        name: 'pubDate',
        description: 'The publication date of the item',
        example: '2024-01-15 14:30:00',
      },
      {
        name: 'feedName',
        description: 'The name of the RSS feed',
        example: 'Tech News',
      },
      {
        name: 'categories',
        description: 'Categories or tags associated with the item',
        example: 'Technology, News, Updates',
      },
    ];
  }

  /**
   * Get template examples
   */
  static getTemplateExamples(): Array<{ name: string; description: string; template: string }> {
    return [
      {
        name: 'Default',
        description: 'Standard format with title, description, and link',
        template: this.DEFAULT_TEMPLATE,
      },
      {
        name: 'Minimal',
        description: 'Just title and link',
        template: '📰 {{title}}\n{{link}}',
      },
      {
        name: 'Detailed',
        description: 'Full information including author and date',
        template:
          '📰 **{{title}}**\n\n{{description}}\n\n👤 Author: {{author}}\n📅 Published: {{pubDate}}\n🏷️ Categories: {{categories}}\n\n[Read more]({{link}})',
      },
      {
        name: 'Feed-focused',
        description: 'Emphasizes the feed source',
        template: '📡 **{{feedName}}**\n\n🔗 {{title}}\n{{description}}\n\n[Read more]({{link}})',
      },
      {
        name: 'Compact',
        description: 'Single line format',
        template: '📰 {{title}} - [Link]({{link}}) ({{feedName}})',
      },
    ];
  }

  /**
   * Escape markdown special characters to prevent formatting issues
   */
  private static escapeMarkdown(text: string): string {
    if (!text) return '';

    // Escape markdown special characters
    return text
      .replace(/\*/g, '\\*')
      .replace(/_/g, '\\_')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/~/g, '\\~')
      .replace(/`/g, '\\`')
      .replace(/>/g, '\\>')
      .replace(/#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/-/g, '\\-')
      .replace(/=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/!/g, '\\!');
  }

  /**
   * Preview a template with sample data
   */
  static previewTemplate(template: string): string {
    const sampleVariables: TemplateVariables = {
      title: 'Sample Article Title',
      link: 'https://example.com/article',
      description:
        'This is a sample description of an RSS article. It provides a brief overview of the content.',
      author: 'John Doe',
      pubDate: '2024-01-15 14:30:00',
      feedName: 'Sample Feed',
      categories: ['Technology', 'News'],
    };

    return this.renderTemplate(template, sampleVariables);
  }
}
