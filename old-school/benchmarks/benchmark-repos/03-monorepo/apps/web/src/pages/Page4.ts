export interface PageProps4 {
  title?: string;
  userId?: string;
}

export class Page4 {
  private props: PageProps4;

  constructor(props: PageProps4 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 4</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 4';
  }
}

export function createPage4(props?: PageProps4): Page4 {
  return new Page4(props);
}
