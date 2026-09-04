export interface WebCompProps36 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp36 {
  private props: WebCompProps36;

  constructor(props: WebCompProps36 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 36</div>';
  }

  getProps(): WebCompProps36 {
    return this.props;
  }
}

export function createWebComp36(props?: WebCompProps36): WebComp36 {
  return new WebComp36(props);
}
