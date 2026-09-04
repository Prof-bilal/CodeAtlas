export interface WebCompProps3 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp3 {
  private props: WebCompProps3;

  constructor(props: WebCompProps3 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 3</div>';
  }

  getProps(): WebCompProps3 {
    return this.props;
  }
}

export function createWebComp3(props?: WebCompProps3): WebComp3 {
  return new WebComp3(props);
}
