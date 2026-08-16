export interface PageProps26 {
  title?: string;
  userId?: string;
}

export class Page26 {
  private props: PageProps26;

  constructor(props: PageProps26 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 26</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 26';
  }
}

export function createPage26(props?: PageProps26): Page26 {
  return new Page26(props);
}
