export interface WebCompProps26 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp26 {
  private props: WebCompProps26;

  constructor(props: WebCompProps26 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 26</div>';
  }

  getProps(): WebCompProps26 {
    return this.props;
  }
}

export function createWebComp26(props?: WebCompProps26): WebComp26 {
  return new WebComp26(props);
}
