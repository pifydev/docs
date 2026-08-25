import { mkdtemp, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, expect, test, vi } from "vitest";

import {
  ExtensionError,
  ExtensionHost,
  MAX_RESOURCE_TEXT_BYTES,
  ResourceError,
  ResourceLoader,
  ToolRegistry,
  defineTool,
  type AgentEvent,
  type ExtensionDefinition,
  type ExtensionInstance,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (reason?: unknown) => void;
}>;

const temporaryDirectories: string[] = [];

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function nextEventLoopTurn(): Promise<void> {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => {
      channel.port1.close();
      channel.port2.close();
      resolve();
    };
    channel.port2.postMessage(undefined);
  });
}

function listenForUnhandledRejections(
  listener: (reason: unknown) => void,
): () => void {
  process.on("unhandledRejection", listener);
  return () => process.removeListener("unhandledRejection", listener);
}

async function settleWithin<Value>(promise: Promise<Value>): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error("operation did not settle")),
      250,
    );
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function temporaryDirectory(name: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `pify-course-${name}-`));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (let index = temporaryDirectories.length - 1; index >= 0; index -= 1) {
    await rm(temporaryDirectories[index], { recursive: true, force: true });
  }
  temporaryDirectories.length = 0;
});

function echoTool(name: string) {
  return defineTool({
    name,
    description: `The ${name} Tool.`,
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input: unknown) => input,
  });
}

function finishedEvent(sequence = 1): AgentEvent {
  return {
    type: "run.finished",
    sequence,
    payload: {
      result: {
        status: "completed",
        messages: [],
        finalText: "done",
      },
    },
  };
}

async function emptyResources(): Promise<ResourceLoader> {
  const directory = await temporaryDirectory("empty-resources");
  return ResourceLoader.create([{ id: "empty", directory }]);
}

test("loads the first matching Resource root and returns immutable metadata", async () => {
  const project = await temporaryDirectory("resource-project");
  const bundled = await temporaryDirectory("resource-bundled");
  await writeFile(join(project, "instructions.md"), "project", "utf8");
  await writeFile(join(bundled, "instructions.md"), "bundled", "utf8");
  await writeFile(join(bundled, "fallback.md"), "fallback", "utf8");

  const loader = await ResourceLoader.create([
    { id: "project", directory: project },
    { id: "bundled", directory: bundled },
  ]);

  await expect(loader.loadText("instructions.md")).resolves.toMatchObject({
    rootId: "project",
    path: "instructions.md",
    content: "project",
  });
  await expect(loader.loadText("fallback.md")).resolves.toMatchObject({
    rootId: "bundled",
    path: "fallback.md",
    content: "fallback",
  });
  await expect(loader.loadText("missing.md")).resolves.toBeUndefined();
  const resource = await loader.loadText("instructions.md");
  expect(Object.isFrozen(resource)).toBe(true);
  expect(Object.isFrozen(loader.roots)).toBe(true);
  expect(loader.roots.map(({ id }) => id)).toEqual(["project", "bundled"]);
  await expect(
    loader.loadText("nested/../instructions.md"),
  ).resolves.toMatchObject({
    rootId: "project",
    path: "instructions.md",
  });
});

test("rejects absolute, traversal, and symlink escapes from trusted roots", async () => {
  const root = await temporaryDirectory("trusted-root");
  const outside = await temporaryDirectory("outside-root");
  await writeFile(join(outside, "secret.txt"), "secret", "utf8");
  const loader = await ResourceLoader.create([
    { id: "trusted", directory: root },
  ]);

  for (const resourcePath of [join(outside, "secret.txt"), "../secret.txt"]) {
    await expect(loader.loadText(resourcePath)).rejects.toMatchObject({
      code: "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
    });
  }

  try {
    await symlink(
      outside,
      join(root, "escape"),
      process.platform === "win32" ? "junction" : "dir",
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EPERM") return;
    throw error;
  }
  await expect(loader.loadText("escape/secret.txt")).rejects.toBeInstanceOf(
    ResourceError,
  );
  await expect(loader.loadText("escape/secret.txt")).rejects.toMatchObject({
    code: "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
  });
});

test("fails closed when a trusted root is replaced after identity capture", async () => {
  const parent = await temporaryDirectory("root-replacement");
  const root = await mkdtemp(join(parent, "root-"));
  await writeFile(join(root, "value.txt"), "original", "utf8");
  const loader = await ResourceLoader.create([{ id: "root", directory: root }]);
  await rename(root, join(parent, "old-root"));
  const replacement = await mkdtemp(join(parent, "replacement-"));
  await rename(replacement, root);
  await writeFile(join(root, "value.txt"), "replacement", "utf8");

  await expect(loader.loadText("value.txt")).rejects.toMatchObject({
    code: "RESOURCE_ROOT_CHANGED",
  });
});

test("enforces the Resource byte cap and fatal UTF-8 decoding", async () => {
  const root = await temporaryDirectory("resource-limits");
  await writeFile(
    join(root, "boundary.txt"),
    Buffer.alloc(MAX_RESOURCE_TEXT_BYTES, 0x61),
  );
  await writeFile(
    join(root, "oversized.txt"),
    Buffer.alloc(MAX_RESOURCE_TEXT_BYTES + 1, 0x61),
  );
  await writeFile(join(root, "invalid.txt"), Buffer.from([0xc3, 0x28]));
  const loader = await ResourceLoader.create([
    { id: "limits", directory: root },
  ]);

  await expect(loader.loadText("boundary.txt")).resolves.toMatchObject({
    content: "a".repeat(MAX_RESOURCE_TEXT_BYTES),
  });
  await expect(loader.loadText("oversized.txt")).rejects.toMatchObject({
    code: "RESOURCE_TOO_LARGE",
  });
  await expect(loader.loadText("invalid.txt")).rejects.toMatchObject({
    code: "RESOURCE_INVALID_UTF8",
  });
});

test("applies one portable Resource path grammar on every host OS", async () => {
  const root = await temporaryDirectory("portable-paths");
  await writeFile(join(root, "safe.txt"), "safe", "utf8");
  const loader = await ResourceLoader.create([
    { id: "portable", directory: root },
  ]);
  const rejected = [
    "C:alias.txt",
    "C:\\absolute.txt",
    "name:stream",
    "\\\\server\\share\\file.txt",
    "\\\\?\\C:\\device.txt",
    "/absolute.txt",
    "..\\escape.txt",
    "folder\\..\\..\\escape.txt",
    "CON",
    "con.txt",
    "folder/PRN.md",
    "AUX.json",
    "NUL.txt",
    "COM1.log",
    "com9",
    "LPT1.txt",
    "folder/lpt9.md",
    "trailing-dot.",
    "trailing-space ",
  ];
  for (let index = 0; index < rejected.length; index += 1) {
    await expect(loader.loadText(rejected[index])).rejects.toMatchObject({
      code: "RESOURCE_OUTSIDE_TRUSTED_ROOTS",
    });
  }
  await expect(loader.loadText("folder\\..\\safe.txt")).resolves.toMatchObject({
    path: "safe.txt",
    content: "safe",
  });
});

test("discovers metadata atomically without running Extension factories", async () => {
  const factory = vi.fn(() => ({ activate: vi.fn() }));
  const host = new ExtensionHost({ resources: await emptyResources() });

  host.discover([
    { id: "alpha", create: factory },
    { id: "beta", create: () => ({ activate: () => undefined }) },
  ]);

  expect(factory).not.toHaveBeenCalled();
  expect(host.extensions).toEqual([
    { id: "alpha", status: "discovered" },
    { id: "beta", status: "discovered" },
  ]);
  expect(Object.isFrozen(host.extensions)).toBe(true);
  expect(() =>
    host.discover([
      { id: "gamma", create: () => ({ activate: () => undefined }) },
      { id: "alpha", create: () => ({ activate: () => undefined }) },
    ]),
  ).toThrowError(expect.objectContaining({ code: "DUPLICATE_EXTENSION_ID" }));
  expect(host.extensions.map(({ id }) => id)).toEqual(["alpha", "beta"]);
});

test("uses stable contract errors for malformed Resource and Extension input", async () => {
  await expect(
    ResourceLoader.create({ length: 0 } as unknown as []),
  ).rejects.toMatchObject({
    name: "ResourceError",
    code: "RESOURCE_INVALID_ROOTS",
  });

  const host = new ExtensionHost({ resources: await emptyResources() });
  const sparse = new Array(1) as ExtensionDefinition[];
  expect(() => host.discover(sparse)).toThrowError(ExtensionError);
  expect(() => host.discover(sparse)).toThrowError(
    expect.objectContaining({ code: "INVALID_EXTENSION_DEFINITION" }),
  );
  expect(
    () =>
      new ExtensionHost(
        null as unknown as ConstructorParameters<typeof ExtensionHost>[0],
      ),
  ).toThrowError(
    expect.objectContaining({ code: "EXTENSION_INVALID_OPTIONS" }),
  );

  const resources = await emptyResources();
  const hostileOptions = { resources } as ConstructorParameters<
    typeof ExtensionHost
  >[0];
  Object.defineProperty(hostileOptions, "tools", {
    get() {
      throw new Error("hostile options getter");
    },
  });
  expect(() => new ExtensionHost(hostileOptions)).toThrowError(
    expect.objectContaining({ code: "EXTENSION_INVALID_OPTIONS" }),
  );
});

test("rejects Proxy-wrapped roots, options, registries, and definitions with stable errors", async () => {
  const root = await temporaryDirectory("proxy-root");
  const rootDefinitions = [{ id: "root", directory: root }];
  await expect(
    ResourceLoader.create(new Proxy(rootDefinitions, {})),
  ).rejects.toMatchObject({
    code: "RESOURCE_INVALID_ROOTS",
  });
  await expect(
    ResourceLoader.create([new Proxy(rootDefinitions[0], {})]),
  ).rejects.toMatchObject({ code: "RESOURCE_INVALID_ROOTS" });

  const resources = await ResourceLoader.create(rootDefinitions);
  const options = { resources };
  expect(
    () =>
      new ExtensionHost(
        new Proxy(options, {}) as ConstructorParameters<
          typeof ExtensionHost
        >[0],
      ),
  ).toThrowError(
    expect.objectContaining({ code: "EXTENSION_INVALID_OPTIONS" }),
  );
  expect(
    () =>
      new ExtensionHost({
        resources: new Proxy(resources, {}),
      }),
  ).toThrowError(
    expect.objectContaining({ code: "EXTENSION_INVALID_OPTIONS" }),
  );
  expect(
    () =>
      new ExtensionHost({
        resources,
        tools: new Proxy(new ToolRegistry(), {}),
      }),
  ).toThrowError(
    expect.objectContaining({ code: "EXTENSION_INVALID_OPTIONS" }),
  );

  const host = new ExtensionHost({ resources });
  const definition: ExtensionDefinition = {
    id: "proxy-definition",
    create: () => ({ activate: () => undefined }),
  };
  expect(() => host.discover(new Proxy([definition], {}))).toThrowError(
    expect.objectContaining({ code: "INVALID_EXTENSION_DEFINITION" }),
  );
  expect(() => host.discover([new Proxy(definition, {})])).toThrowError(
    expect.objectContaining({ code: "INVALID_EXTENSION_DEFINITION" }),
  );
});

test("activates lazily, commits Tools atomically, and invokes hooks in order", async () => {
  const observations: string[] = [];
  const resources = await emptyResources();
  const host = new ExtensionHost({ resources, tools: [echoTool("base")] });
  const definition: ExtensionDefinition = {
    id: "logger",
    create: async () => ({
      activate: async (context) => {
        expect(context.resources).toBe(resources);
        context.registerTool(echoTool("extension"));
        context.onAgentEvent(async (event) => {
          observations.push(`first:${event.sequence}`);
        });
        context.onAgentEvent(() => {
          observations.push("second");
          throw new Error("isolated hook failure");
        });
        context.onAgentEvent(() => observations.push("third"));
      },
    }),
  };

  host.discover([definition]);
  expect(host.tools.names).toEqual(["base"]);
  await host.activate("logger");
  expect(host.tools.names).toEqual(["base", "extension"]);
  expect(host.extensions).toEqual([{ id: "logger", status: "active" }]);

  const failures = await host.emit(finishedEvent(7));

  expect(observations).toEqual(["first:7", "second", "third"]);
  expect(failures).toMatchObject([
    { extensionId: "logger", hookIndex: 1, message: "isolated hook failure" },
  ]);
  expect(Object.isFrozen(failures)).toBe(true);
  expect(Object.isFrozen(failures[0])).toBe(true);
});

test("serializes async factories and observes detached thenable rejections", async () => {
  const order: string[] = [];
  const firstEntered = deferred<void>();
  const releaseFirst = deferred<void>();
  const unhandled: unknown[] = [];
  const stopListening = listenForUnhandledRejections((reason) =>
    unhandled.push(reason),
  );
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "first",
      create: () => ({
        async activate() {
          order.push("first:start");
          firstEntered.resolve();
          await releaseFirst.promise;
          order.push("first:end");
        },
      }),
    },
    {
      id: "thenable",
      create: () =>
        ({
          then(resolve: (value: unknown) => void) {
            order.push("second:factory");
            resolve({
              activate: () =>
                ({
                  then(activateResolve: (value: void) => void) {
                    order.push("second:activate");
                    activateResolve();
                    return Promise.reject(new Error("detached rejection"));
                  },
                }) as PromiseLike<void>,
            });
          },
        }) as PromiseLike<ExtensionInstance>,
    },
  ]);

  try {
    const first = host.activate("first");
    await firstEntered.promise;
    const second = host.activate("thenable");
    expect(order).toEqual(["first:start"]);
    releaseFirst.resolve();
    await Promise.all([first, second]);
    await nextEventLoopTurn();
    expect(order).toEqual([
      "first:start",
      "first:end",
      "second:factory",
      "second:activate",
    ]);
    expect(unhandled).toEqual([]);
  } finally {
    stopListening();
    await host.dispose();
  }
});

test("closes staged contributions inside a hostile thenable settlement callback", async () => {
  let lateError: unknown;
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "settlement-boundary",
      create: () => ({
        activate: (context) =>
          ({
            then(resolve: (value: void) => void) {
              context.registerTool(echoTool("before-settlement"));
              resolve();
              try {
                context.registerTool(echoTool("after-settlement"));
              } catch (error) {
                lateError = error;
              }
            },
          }) as unknown as PromiseLike<void>,
      }),
    },
  ]);

  await host.activate("settlement-boundary");

  expect(host.tools.names).toEqual(["before-settlement"]);
  expect(lateError).toMatchObject({ code: "EXTENSION_ACTIVATION_FAILED" });
});

test("keeps callback scope active while recursively adopting an outer thenable selection", async () => {
  const inner = deferred<void>();
  const releaseDetached = deferred<void>();
  const detachedFinished = deferred<void>();
  let lateContributionError: unknown;
  let pendingOperationCode: unknown;
  let detachedError: unknown;
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "outer-thenable",
      create: () => ({
        activate: (context) =>
          ({
            then(resolve: (value: Promise<void>) => void) {
              context.registerTool(echoTool("selected-before"));
              setTimeout(() => {
                void (async () => {
                  await releaseDetached.promise;
                  await host.activate("after-final");
                })()
                  .catch((error: unknown) => {
                    detachedError = error;
                  })
                  .finally(() => detachedFinished.resolve());
              }, 0);

              resolve(inner.promise);
              try {
                context.registerTool(echoTool("selected-after"));
              } catch (error) {
                lateContributionError = error;
              }

              void (async () => {
                try {
                  await host.emit(finishedEvent(120));
                } catch (error) {
                  pendingOperationCode = (error as ExtensionError).code;
                } finally {
                  inner.resolve();
                }
              })();
            },
          }) as unknown as PromiseLike<void>,
      }),
    },
    {
      id: "after-final",
      create: () => ({
        activate: (context) => context.registerTool(echoTool("after-final")),
      }),
    },
  ]);

  await expect(
    settleWithin(host.activate("outer-thenable")),
  ).resolves.toBeUndefined();
  expect(lateContributionError).toMatchObject({
    code: "EXTENSION_ACTIVATION_FAILED",
  });
  expect(pendingOperationCode).toBe("EXTENSION_REENTRANT_OPERATION");
  expect(host.tools.names).toEqual(["selected-before"]);

  releaseDetached.resolve();
  await detachedFinished.promise;
  expect(detachedError).toBeUndefined();
  expect(host.tools.names).toEqual(["selected-before", "after-final"]);
  await host.dispose();
});

test("rejects reentrant emit from a hook promptly without poisoning the host", async () => {
  let nestedCode: unknown;
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "hook-reentrant",
      create: () => ({
        activate(context) {
          context.onAgentEvent(async () => {
            try {
              await host.emit(finishedEvent(99));
            } catch (error) {
              nestedCode = (error as ExtensionError).code;
            }
          });
        },
      }),
    },
  ]);
  await host.activate("hook-reentrant");

  await expect(settleWithin(host.emit(finishedEvent()))).resolves.toEqual([]);
  expect(nestedCode).toBe("EXTENSION_REENTRANT_OPERATION");
  await expect(settleWithin(host.emit(finishedEvent(2)))).resolves.toEqual([]);
  await host.dispose();
});

test("rejects reentrant dispose during activation promptly and permits recovery", async () => {
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "dispose-during-activation",
      create: () => ({
        activate: async () => host.dispose(),
      }),
    },
    {
      id: "recovery",
      create: () => ({
        activate: (context) => context.registerTool(echoTool("recovered")),
      }),
    },
  ]);

  await expect(
    settleWithin(host.activate("dispose-during-activation")),
  ).rejects.toMatchObject({ code: "EXTENSION_REENTRANT_OPERATION" });
  await expect(
    settleWithin(host.activate("recovery")),
  ).resolves.toBeUndefined();
  expect(host.tools.names).toEqual(["recovered"]);
  await host.dispose();
});

test("rejects reentrant dispose from a disposer without deadlocking outer disposal", async () => {
  let nestedCode: unknown;
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "dispose-reentrant",
      create: () => ({
        activate(context) {
          context.onDispose(async () => {
            try {
              await host.dispose();
            } catch (error) {
              nestedCode = (error as ExtensionError).code;
            }
          });
        },
      }),
    },
  ]);
  await host.activate("dispose-reentrant");

  await expect(settleWithin(host.dispose())).resolves.toBeUndefined();
  expect(nestedCode).toBe("EXTENSION_REENTRANT_OPERATION");
});

test("deactivates callback context after settlement while rejecting calls during pending work", async () => {
  const entered = deferred<void>();
  const triggerNested = deferred<void>();
  const releaseActivation = deferred<void>();
  const detachedTimerEntered = deferred<void>();
  const releaseDetachedTimer = deferred<void>();
  const detachedFinished = deferred<void>();
  let pendingCode: unknown;
  let detachedError: unknown;
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "source",
      create: () => ({
        async activate() {
          void (async () => {
            await triggerNested.promise;
            try {
              await host.emit(finishedEvent(40));
            } catch (error) {
              pendingCode = (error as ExtensionError).code;
            }
          })();
          setTimeout(() => {
            void (async () => {
              detachedTimerEntered.resolve();
              await releaseDetachedTimer.promise;
              await host.activate("detached-target");
            })()
              .catch((error: unknown) => {
                detachedError = error;
              })
              .finally(() => detachedFinished.resolve());
          }, 0);
          entered.resolve();
          await releaseActivation.promise;
        },
      }),
    },
    {
      id: "detached-target",
      create: () => ({
        activate: (context) =>
          context.registerTool(echoTool("detached-target")),
      }),
    },
  ]);

  const activation = host.activate("source");
  await entered.promise;
  await detachedTimerEntered.promise;
  triggerNested.resolve();
  await nextEventLoopTurn();
  expect(pendingCode).toBe("EXTENSION_REENTRANT_OPERATION");
  releaseActivation.resolve();
  await activation;
  releaseDetachedTimer.resolve();
  await detachedFinished.promise;

  expect(detachedError).toBeUndefined();
  expect(host.tools.names).toEqual(["detached-target"]);
  await host.dispose();
});

test("internally observes fire-and-forget reentrant rejection Promises", async () => {
  const unhandled: unknown[] = [];
  const stopListening = listenForUnhandledRejections((reason) =>
    unhandled.push(reason),
  );
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "fire-and-forget",
      create: () => ({
        activate(context) {
          context.onAgentEvent(() => {
            void host.emit(finishedEvent(80));
            void host.activate("target");
            void host.dispose();
          });
        },
      }),
    },
    {
      id: "target",
      create: () => ({ activate: () => undefined }),
    },
  ]);

  try {
    await host.activate("fire-and-forget");
    await host.emit(finishedEvent());
    await nextEventLoopTurn();
    await nextEventLoopTurn();
    expect(unhandled).toEqual([]);
    await host.activate("target");
  } finally {
    stopListening();
    await host.dispose();
  }
});

test("rolls back a partial activation in reverse order and can recover", async () => {
  const cleanup: string[] = [];
  const host = new ExtensionHost({
    resources: await emptyResources(),
    tools: [echoTool("base")],
  });
  host.discover([
    {
      id: "broken",
      create: () => ({
        activate(context) {
          context.registerTool(echoTool("temporary"));
          context.onDispose(() => cleanup.push("first"));
          context.onDispose(async () => {
            cleanup.push("second");
          });
          throw new Error("activation failed");
        },
        dispose: () => cleanup.push("instance"),
      }),
    },
    {
      id: "healthy",
      create: () => ({
        activate: (context) => context.registerTool(echoTool("healthy")),
      }),
    },
  ]);

  await expect(host.activate("broken")).rejects.toMatchObject({
    code: "EXTENSION_ACTIVATION_FAILED",
  });
  expect(cleanup).toEqual(["second", "first", "instance"]);
  expect(host.tools.names).toEqual(["base"]);
  expect(host.extensions).toEqual([
    { id: "broken", status: "failed" },
    { id: "healthy", status: "discovered" },
  ]);

  await host.activate("healthy");
  expect(host.tools.names).toEqual(["base", "healthy"]);
});

test("reports activation and reverse rollback failures in one frozen aggregate", async () => {
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "rollback-failures",
      create: () => ({
        activate(context) {
          context.registerTool(echoTool("never-live"));
          context.onDispose(() => {
            cleanup.push("first");
            throw new Error("cleanup first");
          });
          context.onDispose(async () => {
            cleanup.push("second");
            throw new Error("cleanup second");
          });
          throw new Error("primary activation");
        },
      }),
    },
    {
      id: "after-rollback",
      create: () => ({
        activate: (context) => context.registerTool(echoTool("after-rollback")),
      }),
    },
  ]);

  let failure: ExtensionError | undefined;
  try {
    await host.activate("rollback-failures");
  } catch (error) {
    failure = error as ExtensionError;
  }
  expect(failure).toMatchObject({
    code: "EXTENSION_ACTIVATION_ROLLBACK_FAILED",
  });
  expect(failure?.cause).toBeInstanceOf(AggregateError);
  const aggregate = failure?.cause as AggregateError;
  expect(Object.isFrozen(aggregate)).toBe(true);
  expect(Object.isFrozen(aggregate.errors)).toBe(true);
  expect(aggregate.errors.map((error) => (error as Error).message)).toEqual([
    "primary activation",
    "cleanup second",
    "cleanup first",
  ]);
  expect(cleanup).toEqual(["second", "first"]);
  expect(host.tools.names).toEqual([]);
  await host.activate("after-rollback");
  expect(host.tools.names).toEqual(["after-rollback"]);
  await host.dispose();
});

test("aggregates every disposal failure after attempting all reverse cleanup", async () => {
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "disposal-failures",
      create: () => ({
        activate(context) {
          context.onDispose(() => {
            cleanup.push("first");
            throw new Error("dispose first");
          });
          context.onDispose(() => {
            cleanup.push("second");
            throw new Error("dispose second");
          });
        },
        dispose() {
          cleanup.push("instance");
          throw new Error("dispose instance");
        },
      }),
    },
  ]);
  await host.activate("disposal-failures");

  let failure: ExtensionError | undefined;
  try {
    await host.dispose();
  } catch (error) {
    failure = error as ExtensionError;
  }
  expect(failure).toMatchObject({ code: "EXTENSION_DISPOSAL_FAILED" });
  expect(failure?.cause).toBeInstanceOf(AggregateError);
  const aggregate = failure?.cause as AggregateError;
  expect(Object.isFrozen(aggregate)).toBe(true);
  expect(Object.isFrozen(aggregate.errors)).toBe(true);
  expect(aggregate.errors.map((error) => (error as Error).message)).toEqual([
    "dispose second",
    "dispose first",
    "dispose instance",
  ]);
  expect(cleanup).toEqual(["second", "first", "instance"]);
});

test("rejects duplicate Tool contributions without partially changing the live registry", async () => {
  const disposed: string[] = [];
  const host = new ExtensionHost({
    resources: await emptyResources(),
    tools: [echoTool("taken")],
  });
  host.discover([
    {
      id: "collision",
      create: () => ({
        activate(context) {
          context.registerTool(echoTool("new"));
          context.registerTool(echoTool("taken"));
          context.onDispose(() => disposed.push("rollback"));
        },
      }),
    },
  ]);

  await expect(host.activate("collision")).rejects.toMatchObject({
    code: "EXTENSION_ACTIVATION_FAILED",
  });
  expect(host.tools.names).toEqual(["taken"]);
  expect(disposed).toEqual(["rollback"]);
});

test("serializes activation, aborts an in-flight activation on dispose, and disposes once", async () => {
  const entered = deferred<void>();
  const released = deferred<void>();
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "slow",
      create: () => ({
        async activate(context) {
          context.onDispose(() => cleanup.push("slow"));
          entered.resolve();
          await new Promise<void>((resolve) => {
            context.signal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
          await released.promise;
        },
      }),
    },
  ]);

  const activation = host.activate("slow");
  await entered.promise;
  const firstDispose = host.dispose();
  const secondDispose = host.dispose();
  expect(secondDispose).toBe(firstDispose);
  released.resolve();

  await expect(activation).rejects.toMatchObject({
    code: "EXTENSION_CANCELLED",
  });
  await expect(firstDispose).resolves.toBeUndefined();
  expect(cleanup).toEqual(["slow"]);
  await expect(host.activate("slow")).rejects.toMatchObject({
    code: "EXTENSION_HOST_DISPOSED",
  });
});

test("disposes an instance produced after disposal cancelled its pending factory", async () => {
  const factoryEntered = deferred<void>();
  const factoryReleased = deferred<void>();
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "factory-race",
      async create() {
        factoryEntered.resolve();
        await factoryReleased.promise;
        return {
          activate: () => undefined,
          dispose: () => cleanup.push("instance"),
        };
      },
    },
  ]);

  const activation = host.activate("factory-race");
  await factoryEntered.promise;
  const disposal = host.dispose();
  factoryReleased.resolve();

  await expect(activation).rejects.toMatchObject({
    code: "EXTENSION_CANCELLED",
  });
  await disposal;
  expect(cleanup).toEqual(["instance"]);
});

test("classifies cooperative abort rejection as cancellation and reads signal intrinsics", async () => {
  const controller = new AbortController();
  Object.defineProperties(controller.signal, {
    aborted: {
      configurable: true,
      get() {
        throw new Error("hostile aborted getter");
      },
    },
    reason: {
      configurable: true,
      get() {
        throw new Error("hostile reason getter");
      },
    },
  });
  const entered = deferred<void>();
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "cooperative-cancel",
      create: () => ({
        activate(context) {
          entered.resolve();
          return new Promise((_resolve, reject) => {
            context.signal.addEventListener(
              "abort",
              () => reject(new Error("cooperative stop")),
              { once: true },
            );
          });
        },
      }),
    },
  ]);

  const activation = host.activate("cooperative-cancel", controller.signal);
  await entered.promise;
  controller.abort("cancel requested");
  await expect(activation).rejects.toMatchObject({
    code: "EXTENSION_CANCELLED",
  });
  await host.dispose();
});

test("rejects a forged AbortSignal at the typed activation options boundary", async () => {
  const factory = vi.fn(() => ({ activate: () => undefined }));
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([{ id: "forged-signal", create: factory }]);
  const forged = Object.create(AbortSignal.prototype) as AbortSignal;

  await expect(host.activate("forged-signal", forged)).rejects.toMatchObject({
    name: "ExtensionError",
    code: "EXTENSION_INVALID_OPTIONS",
  });
  expect(factory).not.toHaveBeenCalled();
  await host.activate("forged-signal");
  await host.dispose();
});

test("preserves cancellation inside rollback-failure aggregate", async () => {
  const controller = new AbortController();
  const entered = deferred<void>();
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "cancel-rollback",
      create: () => ({
        activate(context) {
          context.onDispose(() => {
            throw new Error("cancel cleanup failed");
          });
          entered.resolve();
          return new Promise((_resolve, reject) => {
            context.signal.addEventListener(
              "abort",
              () => reject(new Error("cooperative rejection")),
              { once: true },
            );
          });
        },
      }),
    },
  ]);

  const activation = host.activate("cancel-rollback", controller.signal);
  await entered.promise;
  controller.abort("stop");
  let failure: ExtensionError | undefined;
  try {
    await activation;
  } catch (error) {
    failure = error as ExtensionError;
  }
  expect(failure).toMatchObject({
    code: "EXTENSION_ACTIVATION_ROLLBACK_FAILED",
  });
  const aggregate = failure?.cause as AggregateError;
  expect(aggregate.errors[0]).toMatchObject({ code: "EXTENSION_CANCELLED" });
  expect((aggregate.errors[1] as Error).message).toBe("cancel cleanup failed");
  await host.dispose();
});

test("disposes a factory-created instance even when its activate contract is invalid", async () => {
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  host.discover([
    {
      id: "invalid-instance",
      create: () =>
        ({
          activate: 42,
          dispose: () => cleanup.push("instance"),
        }) as unknown as ReturnType<ExtensionDefinition["create"]>,
    },
  ]);

  await expect(host.activate("invalid-instance")).rejects.toMatchObject({
    code: "INVALID_EXTENSION_DEFINITION",
  });
  expect(cleanup).toEqual(["instance"]);
});

test("disposes active Extensions and their owned resources in reverse order", async () => {
  const cleanup: string[] = [];
  const host = new ExtensionHost({ resources: await emptyResources() });
  const extension = (id: string): ExtensionDefinition => ({
    id,
    create: () => ({
      activate(context) {
        context.onDispose(() => cleanup.push(`${id}:resource-1`));
        context.onDispose(() => cleanup.push(`${id}:resource-2`));
      },
      dispose: () => cleanup.push(`${id}:instance`),
    }),
  });
  host.discover([extension("first"), extension("second")]);
  await host.activate("first");
  await host.activate("second");

  await host.dispose();

  expect(cleanup).toEqual([
    "second:resource-2",
    "second:resource-1",
    "second:instance",
    "first:resource-2",
    "first:resource-1",
    "first:instance",
  ]);
  expect(host.tools.names).toEqual([]);
});

test("does not trust overridden ToolRegistry or caller array methods", async () => {
  class HostileRegistry extends ToolRegistry {
    public armed = false;

    public override snapshot(): ToolRegistry {
      if (this.armed) throw new Error("hostile snapshot override");
      return super.snapshot();
    }

    public override registerMany(definitions: readonly unknown[]): void {
      if (this.armed) throw new Error("hostile registerMany override");
      super.registerMany(definitions);
    }
  }

  const base = new HostileRegistry([echoTool("base")]);
  base.armed = true;
  const host = new ExtensionHost({
    resources: await emptyResources(),
    tools: base,
  });
  const definitions: ExtensionDefinition[] = [
    {
      id: "safe",
      create: () => ({
        activate: () => undefined,
      }),
    },
  ];
  Object.defineProperties(definitions, {
    entries: {
      value: () => {
        throw new Error("untrusted entries");
      },
    },
    map: {
      value: () => {
        throw new Error("untrusted map");
      },
    },
    [Symbol.iterator]: {
      value: () => {
        throw new Error("untrusted iterator");
      },
    },
  });

  expect(() => host.discover(definitions)).not.toThrow();
  expect(host.extensions).toEqual([{ id: "safe", status: "discovered" }]);
  expect(host.tools.names).toEqual(["base"]);
});
