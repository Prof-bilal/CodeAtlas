export interface PageProps1 {
  title?: string;
  userId?: string;
}

export class Page1 {
  private props: PageProps1;

  constructor(props: PageProps1 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 1</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 1';
  }
}

export function createPage1(props?: PageProps1): Page1 {
  return new Page1(props);
}
