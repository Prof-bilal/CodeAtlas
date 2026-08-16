export interface PageProps5 {
  title?: string;
  userId?: string;
}

export class Page5 {
  private props: PageProps5;

  constructor(props: PageProps5 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 5</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 5';
  }
}

export function createPage5(props?: PageProps5): Page5 {
  return new Page5(props);
}
