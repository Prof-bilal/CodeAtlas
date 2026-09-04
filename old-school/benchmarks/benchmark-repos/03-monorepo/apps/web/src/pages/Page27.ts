export interface PageProps27 {
  title?: string;
  userId?: string;
}

export class Page27 {
  private props: PageProps27;

  constructor(props: PageProps27 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 27</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 27';
  }
}

export function createPage27(props?: PageProps27): Page27 {
  return new Page27(props);
}
