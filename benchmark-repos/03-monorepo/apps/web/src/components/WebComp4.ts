export interface WebCompProps4 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp4 {
  private props: WebCompProps4;

  constructor(props: WebCompProps4 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 4</div>';
  }

  getProps(): WebCompProps4 {
    return this.props;
  }
}

export function createWebComp4(props?: WebCompProps4): WebComp4 {
  return new WebComp4(props);
}
