export interface PageProps25 {
  title?: string;
  userId?: string;
}

export class Page25 {
  private props: PageProps25;

  constructor(props: PageProps25 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 25</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 25';
  }
}

export function createPage25(props?: PageProps25): Page25 {
  return new Page25(props);
}
