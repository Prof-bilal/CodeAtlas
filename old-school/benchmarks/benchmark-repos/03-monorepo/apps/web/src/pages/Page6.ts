export interface PageProps6 {
  title?: string;
  userId?: string;
}

export class Page6 {
  private props: PageProps6;

  constructor(props: PageProps6 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 6</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 6';
  }
}

export function createPage6(props?: PageProps6): Page6 {
  return new Page6(props);
}
