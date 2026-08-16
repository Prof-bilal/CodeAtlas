export interface PageProps8 {
  title?: string;
  userId?: string;
}

export class Page8 {
  private props: PageProps8;

  constructor(props: PageProps8 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 8</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 8';
  }
}

export function createPage8(props?: PageProps8): Page8 {
  return new Page8(props);
}
