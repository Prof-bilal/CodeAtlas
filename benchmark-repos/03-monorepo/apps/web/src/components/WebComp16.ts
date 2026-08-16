export interface WebCompProps16 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp16 {
  private props: WebCompProps16;

  constructor(props: WebCompProps16 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 16</div>';
  }

  getProps(): WebCompProps16 {
    return this.props;
  }
}

export function createWebComp16(props?: WebCompProps16): WebComp16 {
  return new WebComp16(props);
}
