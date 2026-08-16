export interface WebCompProps17 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp17 {
  private props: WebCompProps17;

  constructor(props: WebCompProps17 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 17</div>';
  }

  getProps(): WebCompProps17 {
    return this.props;
  }
}

export function createWebComp17(props?: WebCompProps17): WebComp17 {
  return new WebComp17(props);
}
