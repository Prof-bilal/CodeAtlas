export interface WebCompProps1 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp1 {
  private props: WebCompProps1;

  constructor(props: WebCompProps1 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 1</div>';
  }

  getProps(): WebCompProps1 {
    return this.props;
  }
}

export function createWebComp1(props?: WebCompProps1): WebComp1 {
  return new WebComp1(props);
}
