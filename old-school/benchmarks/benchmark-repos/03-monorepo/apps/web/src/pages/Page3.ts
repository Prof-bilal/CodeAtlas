export interface PageProps3 {
  title?: string;
  userId?: string;
}

export class Page3 {
  private props: PageProps3;

  constructor(props: PageProps3 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 3</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 3';
  }
}

export function createPage3(props?: PageProps3): Page3 {
  return new Page3(props);
}
