export interface WebCompProps2 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp2 {
  private props: WebCompProps2;

  constructor(props: WebCompProps2 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 2</div>';
  }

  getProps(): WebCompProps2 {
    return this.props;
  }
}

export function createWebComp2(props?: WebCompProps2): WebComp2 {
  return new WebComp2(props);
}
