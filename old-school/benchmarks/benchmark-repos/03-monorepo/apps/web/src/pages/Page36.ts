export interface PageProps36 {
  title?: string;
  userId?: string;
}

export class Page36 {
  private props: PageProps36;

  constructor(props: PageProps36 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 36</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 36';
  }
}

export function createPage36(props?: PageProps36): Page36 {
  return new Page36(props);
}
