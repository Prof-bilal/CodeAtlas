# @atlas/sdk

The **public façade** and composition root of CodeAtlas. It exposes a `Container`
that registers concrete implementations behind the `core` ports and lets
consumers — including the CLI — talk to the whole engine through one object.

Consumers should depend on **only** this package, never on individual feature
packages directly.

```ts
import { Container } from "@atlas/sdk";

const container = Container.create();
const scanner = container.getScanner();
```

## Plugins

Any port can be swapped by passing an implementation to `Container.create()`:

```ts
import { Container } from "@atlas/sdk";
import { MyProvider } from "./my-provider";

const container = Container.create({ provider: new MyProvider() });
```

This is the extension point future third-party plugins will use.
