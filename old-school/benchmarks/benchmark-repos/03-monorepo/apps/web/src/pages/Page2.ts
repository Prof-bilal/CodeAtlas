export interface PageProps2 {
  title?: string;
  userId?: string;
}

export class Page2 {
  private props: PageProps2;

  constructor(props: PageProps2 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 2</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 2';
  }
}

export function createPage2(props?: PageProps2): Page2 {
  return new Page2(props);
}
