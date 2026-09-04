export interface WebCompProps25 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp25 {
  private props: WebCompProps25;

  constructor(props: WebCompProps25 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 25</div>';
  }

  getProps(): WebCompProps25 {
    return this.props;
  }
}

export function createWebComp25(props?: WebCompProps25): WebComp25 {
  return new WebComp25(props);
}
