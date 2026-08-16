export interface PageProps38 {
  title?: string;
  userId?: string;
}

export class Page38 {
  private props: PageProps38;

  constructor(props: PageProps38 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 38</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 38';
  }
}

export function createPage38(props?: PageProps38): Page38 {
  return new Page38(props);
}
