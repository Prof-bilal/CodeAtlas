export interface WebCompProps23 {
  id?: string;
  data?: Record<string, unknown>;
  className?: string;
}

export class WebComp23 {
  private props: WebCompProps23;

  constructor(props: WebCompProps23 = {}) {
    this.props = props;
  }

  render(): string {
    return '<div class="web-comp">WebComp 23</div>';
  }

  getProps(): WebCompProps23 {
    return this.props;
  }
}

export function createWebComp23(props?: WebCompProps23): WebComp23 {
  return new WebComp23(props);
}
