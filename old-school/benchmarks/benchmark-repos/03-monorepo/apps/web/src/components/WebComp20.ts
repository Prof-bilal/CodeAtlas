export interface WebCompProps20 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp20 {
  private props: WebCompProps20;

  constructor(props: WebCompProps20 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 20</div>';
  }

  getProps(): WebCompProps20 {
    return this.props;
  }
}

export function createWebComp20(props?: WebCompProps20): WebComp20 {
  return new WebComp20(props);
}
