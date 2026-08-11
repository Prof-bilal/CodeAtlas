#!/usr/bin/env node
import { createCli } from "./cli";

await createCli().parseAsync(process.argv);
