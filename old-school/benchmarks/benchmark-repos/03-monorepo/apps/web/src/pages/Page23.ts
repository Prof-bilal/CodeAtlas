export interface PageProps23 {
  title?: string;
  userId?: string;
}

export class Page23 {
  private props: PageProps23;

  constructor(props: PageProps23 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 23</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 23';
  }
}

export function createPage23(props?: PageProps23): Page23 {
  return new Page23(props);
}
