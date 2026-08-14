import { CacheService } from "@atlas/cache";
import { ContextBuilderService } from "@atlas/context";
import type {
  CachePort,
  ContextBuilderPort,
  ContextDatabasePort,
  GraphPort,
  ParserPort,
  ProviderPort,
  ScannerPort,
  SearchPort,
  StoragePort,
  SummaryPort,
} from "@atlas/core";
import { GraphService } from "@atlas/graph";
import { HashService } from "@atlas/hashing";
import { ParserService } from "@atlas/parser";
import { ScannerService } from "@atlas/scanner";
import { SearchService } from "@atlas/search";
import { ContextStore, StorageService } from "@atlas/storage";
import { SummaryService } from "@atlas/summary";
import { createProviderService } from "./providers/index";

/** The full set of services that make up a CodeAtlas runtime. */
export interface ContainerServices {
  readonly scanner: ScannerPort;
  readonly parser: ParserPort;
  readonly storage: StoragePort;
  readonly graph: GraphPort;
  readonly context: ContextBuilderPort;
  readonly cache: CachePort;
  readonly provider: ProviderPort;
  readonly summary: SummaryPort;
  readonly contextDb: ContextDatabasePort;
  readonly search: SearchPort;
}

/**
 * Optional overrides. Any service can be replaced with a custom implementation,
 * which is how plugins are wired into the system.
 */
export type ContainerOptions = Partial<ContainerServices>;

/**
 * The composition root of CodeAtlas. Constructs and exposes every service
 * behind its `core` port interface, defaulting to the built-in implementations.
 */
export class Container {
  private constructor(private readonly services: ContainerServices) {}

  /** Create a container, using built-in defaults unless overridden. */
  public static create(options: ContainerOptions = {}): Container {
    const provider = options.provider ?? createProviderService();
    const cache = options.cache ?? new CacheService();
    const contextDb = options.contextDb ?? new ContextStore({ filePath: ":memory:" });
    const search = options.search ?? new SearchService({ db: contextDb });
    return new Container({
      scanner: options.scanner ?? new ScannerService(),
      parser: options.parser ?? new ParserService(),
      storage: options.storage ?? new StorageService(),
      graph: options.graph ?? new GraphService(),
      context: options.context ?? new ContextBuilderService({ search, db: contextDb }),
      cache,
      provider,
      summary: options.summary ?? new SummaryService({ provider, cache, hash: new HashService() }),
      contextDb,
      search,
    });
  }

  public getScanner(): ScannerPort {
    return this.services.scanner;
  }

  public getParser(): ParserPort {
    return this.services.parser;
  }

  public getStorage(): StoragePort {
    return this.services.storage;
  }

  public getGraph(): GraphPort {
    return this.services.graph;
  }

  public getContext(): ContextBuilderPort {
    return this.services.context;
  }

  public getCache(): CachePort {
    return this.services.cache;
  }

  public getProvider(): ProviderPort {
    return this.services.provider;
  }

  public getSummary(): SummaryPort {
    return this.services.summary;
  }

  public getContextDb(): ContextDatabasePort {
    return this.services.contextDb;
  }

  public getSearch(): SearchPort {
    return this.services.search;
  }
}

/**
 * Open a container backed by an on-disk context database file (e.g.
 * `.codeatlas/context.db`). This is the entry point the CLI uses to run
 * `atlas search` against a persisted project index.
 */
export function createProjectContainer(dbPath: string, options: ContainerOptions = {}): Container {
  return Container.create({
    ...options,
    contextDb: options.contextDb ?? new ContextStore({ filePath: dbPath }),
  });
}
