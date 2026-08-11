# Examples

This directory will hold runnable examples showing how to use the `@atlas/sdk`
programmatically and how to write plugins.

Today the SDK entry points are real and tested: `createContextSDK` (read a
project's indexed context), `Container` (composition root), and
`createProjectContainer` (a container bound to an on-disk context DB). The
indexing pipeline that *produces* an index is not yet wired into a CLI command
(`atlas init`/`build`/`update` are still "Coming Soon" placeholders), so runnable
end-to-end examples will be added once that lands.
