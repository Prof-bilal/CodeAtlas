export interface PageProps37 {
  title?: string;
  userId?: string;
}

export class Page37 {
  private props: PageProps37;

  constructor(props: PageProps37 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div>Page 37</div>';
  }

  getTitle(): string {
    return this.props.title || 'Page 37';
  }
}

export function createPage37(props?: PageProps37): Page37 {
  return new Page37(props);
}
