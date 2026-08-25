import { lstat, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  CourseRuntimeError,
  ScriptedModel,
  createCourseRuntime,
  createCourseRuntimeManager,
  defineTool,
  type AgentEvent,
  type CourseAssistantBlock,
  type CourseModelChunk,
  type CourseModelRequest,
  type CourseModelResponse,
  type CourseRuntimeFactoryOverrides,
  type ExtensionDefinition,
  type ScriptedResponseFactory,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
  reject: (reason?: unknown) => void;
}>;

const workspaces: string[] = [];

afterEach(async () => {
  while (workspaces.length > 0) {
    const workspace = workspaces.pop();
    if (workspace !== undefined) {
      await rm(workspace, { force: true, recursive: true });
    }
  }
});

function deferred<Value>(): Deferred<Value> {
  let resolvePromise!: (value: Value | PromiseLike<Value>) => void;
  let rejectPromise!: (reason?: unknown) => void;
  const promise = new Promise<Value>((resolveValue, rejectValue) => {
    resolvePromise = resolveValue;
    rejectPromise = rejectValue;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

async function workspace(label: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), `pify-runtime-${label}-`));
  workspaces.push(directory);
  return directory;
}

function responseFor(
  request: CourseModelRequest,
  id: string,
  content: readonly CourseAssistantBlock[],
  stopReason: CourseModelResponse["stopReason"] = "stop",
): CourseModelResponse {
  return {
    id,
    requestId: request.id,
    message: { id: `message-${id}`, role: "assistant", content },
    stopReason,
    usage: { inputTokens: 3, outputTokens: 2 },
  };
}

function scriptedResponse(id: string, text: string): ScriptedResponseFactory {
  return async function* (request) {
    const chunk: CourseModelChunk = {
      type: "textDelta",
      requestId: request.id,
      delta: text,
    };
    yield chunk;
    return responseFor(request, id, [{ type: "text", text }]);
  };
}

async function drain(source: AsyncIterable<AgentEvent>): Promise<AgentEvent[]> {
  const events: AgentEvent[] = [];
  for await (const event of source) events.push(event);
  return events;
}

function runtimeOptions(
  cwd: string,
  model: ScriptedModel,
  overrides: Readonly<{
    mode?: "create" | "resume";
    extensions?: readonly ExtensionDefinition[];
    factories?: CourseRuntimeFactoryOverrides;
  }> = {},
) {
  return {
    cwd,
    model,
    session: {
      path: "course-session.jsonl",
      mode: overrides.mode ?? ("create" as const),
      options: {
        sessionId: `session-${cwd.split(/[\\/]/u).at(-1) ?? "runtime"}`,
      },
    },
    extensions: overrides.extensions ?? [],
    ...(overrides.factories === undefined
      ? {}
      : { factories: overrides.factories }),
  };
}

test("constructs workspace-owned parts in order and returns a frozen composition root", async () => {
  const cwd = await workspace("construction");
  const order: string[] = [];
  const factories: CourseRuntimeFactoryOverrides = {
    createTools: async (input, fallback) => {
      order.push("tools");
      return fallback(input);
    },
    createResources: async (input, fallback) => {
      order.push("resources");
      return fallback(input);
    },
    createSession: async (input, fallback) => {
      order.push("session");
      return fallback(input);
    },
    createExtensions: async (input, fallback) => {
      order.push("extensions");
      return fallback(input);
    },
    createAgent: async (input, fallback) => {
      order.push("agent");
      return fallback(input);
    },
  };

  const runtime = await createCourseRuntime(
    runtimeOptions(cwd, new ScriptedModel([]), { factories }),
  );

  expect(order).toEqual([
    "tools",
    "resources",
    "session",
    "extensions",
    "agent",
  ]);
  expect(Object.isFrozen(runtime)).toBe(true);
  expect(Object.isFrozen(runtime.workspace)).toBe(true);
  expect(runtime.workspace.root).toBe(await resolve(cwd));
  expect(runtime.tools.names).toEqual([
    "read_file",
    "write_file",
    "node_process",
  ]);
  expect(runtime.extensions.resources.roots).toEqual([
    { id: "workspace", directory: await resolve(cwd) },
  ]);
  await runtime.dispose();
});

test("persists Agent messages and resumes the active Session branch", async () => {
  const cwd = await workspace("resume");
  const created = await createCourseRuntime(
    runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("first", "Persisted")]),
    ),
  );
  const eventsPromise = drain(created.agent.prompt("Remember this"));
  await eventsPromise;
  await created.flush();
  expect(created.session.activeMessages.map((message) => message.role)).toEqual(
    ["user", "assistant"],
  );
  await created.dispose();

  const resumed = await createCourseRuntime(
    runtimeOptions(cwd, new ScriptedModel([]), { mode: "resume" }),
  );
  expect(resumed.agent.messages).toEqual(resumed.session.activeMessages);
  expect(resumed.agent.messages).toHaveLength(2);
  expect(resumed.agent.messages[0]).toMatchObject({
    role: "user",
    content: "Remember this",
  });
  await resumed.dispose();
});

test("serializes event persistence and Extension hooks without losing order", async () => {
  const cwd = await workspace("events");
  const firstHookEntered = deferred<void>();
  const releaseFirstHook = deferred<void>();
  const seen: string[] = [];
  let activeHooks = 0;
  let maximumActiveHooks = 0;
  const extension: ExtensionDefinition = {
    id: "ordered-events",
    create: () => ({
      activate(context) {
        context.onAgentEvent(async (event) => {
          activeHooks += 1;
          maximumActiveHooks = Math.max(maximumActiveHooks, activeHooks);
          seen.push(`start:${event.type}`);
          if (event.sequence === 0) {
            firstHookEntered.resolve();
            await releaseFirstHook.promise;
          }
          seen.push(`end:${event.type}`);
          activeHooks -= 1;
        });
      },
    }),
  };
  const runtime = await createCourseRuntime(
    runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("events", "Done")]),
      { extensions: [extension] },
    ),
  );

  const eventsPromise = drain(runtime.agent.prompt("Go"));
  await firstHookEntered.promise;
  expect(seen).toEqual(["start:message.accepted"]);
  releaseFirstHook.resolve();
  const events = await eventsPromise;
  await runtime.flush();

  expect(maximumActiveHooks).toBe(1);
  expect(seen).toEqual(
    events.flatMap((event) => [`start:${event.type}`, `end:${event.type}`]),
  );
  expect(runtime.session.activeMessages).toEqual(runtime.agent.messages);
  await runtime.dispose();
});

test("persists an Assistant Tool call before its linked Tool result", async () => {
  const cwd = await workspace("tool-order");
  const toolResponse: ScriptedResponseFactory = async function* (request) {
    const toolCall = {
      type: "toolCall" as const,
      id: "call-echo-001",
      name: "echo",
      arguments: { text: "hello" },
    };
    yield { type: "toolCall", requestId: request.id, toolCall };
    return responseFor(request, "tool-call", [toolCall], "toolCall");
  };
  const echo = defineTool({
    name: "echo",
    description: "Return validated text.",
    validate(input: unknown) {
      if (
        typeof input === "object" &&
        input !== null &&
        typeof Reflect.get(input, "text") === "string"
      ) {
        return { ok: true as const, value: input as { text: string } };
      }
      return { ok: false as const, error: "INVALID_TEXT" };
    },
    async execute(input: { text: string }) {
      return input.text;
    },
  });
  const runtime = await createCourseRuntime({
    ...runtimeOptions(
      cwd,
      new ScriptedModel([
        toolResponse,
        scriptedResponse("tool-final", "Tool complete"),
      ]),
    ),
    tools: [echo],
  });

  await drain(runtime.agent.prompt("Use the Tool"));
  await runtime.flush();
  expect(runtime.session.activeMessages.map((message) => message.role)).toEqual(
    ["user", "assistant", "toolResult", "assistant"],
  );
  expect(runtime.session.activeMessages[1]).toMatchObject({
    role: "assistant",
    content: [{ id: "call-echo-001", name: "echo" }],
  });
  expect(runtime.session.activeMessages[2]).toMatchObject({
    role: "toolResult",
    toolCallId: "call-echo-001",
    toolName: "echo",
  });
  expect(runtime.session.activeMessages).toEqual(runtime.agent.messages);
  await runtime.dispose();
});

test("surfaces persistence and hook failures through flush without unhandled loss", async () => {
  const cwd = await workspace("failure");
  const extension: ExtensionDefinition = {
    id: "failing-hook",
    create: () => ({
      activate(context) {
        context.onAgentEvent(() => {
          throw new Error("hook failed");
        });
      },
    }),
  };
  const runtime = await createCourseRuntime(
    runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("failure", "Done")]),
      { extensions: [extension] },
    ),
  );

  await drain(runtime.agent.prompt("Go"));
  await expect(runtime.flush()).rejects.toMatchObject({
    name: "CourseRuntimeError",
    code: "RUNTIME_EVENT_FAILED",
  });
  await expect(runtime.flush()).rejects.toBeInstanceOf(CourseRuntimeError);
  await expect(runtime.dispose()).rejects.toMatchObject({
    code: "RUNTIME_DISPOSAL_FAILED",
  });
});

test("fails closed when Session persistence rejects and exposes the same failure", async () => {
  const cwd = await workspace("persistence-failure");
  let failStorageChecks = false;
  const runtime = await createCourseRuntime({
    ...runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("storage", "Not durable")]),
    ),
    session: {
      path: "course-session.jsonl",
      mode: "create",
      options: {
        sessionId: "persistence-failure",
        fileSystem: {
          lstat: async (path) => {
            if (failStorageChecks) throw new Error("storage unavailable");
            return lstat(path, { bigint: true });
          },
        },
      },
    },
  });
  failStorageChecks = true;

  await drain(runtime.agent.prompt("This append must fail"));
  const firstFailure = await runtime.flush().catch((error: unknown) => error);
  const secondFailure = await runtime.flush().catch((error: unknown) => error);
  expect(firstFailure).toMatchObject({
    name: "CourseRuntimeError",
    code: "RUNTIME_EVENT_FAILED",
  });
  expect(secondFailure).toBe(firstFailure);
  await expect(runtime.dispose()).rejects.toMatchObject({
    code: "RUNTIME_DISPOSAL_FAILED",
  });
});

test("rejects reentrant runtime operations from an Extension hook without deadlock", async () => {
  const cwd = await workspace("runtime-reentrant");
  const codes: unknown[] = [];
  const binding: {
    runtime?: Awaited<ReturnType<typeof createCourseRuntime>>;
  } = {};
  const extension: ExtensionDefinition = {
    id: "runtime-reentrant",
    create: () => ({
      activate(context) {
        context.onAgentEvent(async () => {
          const runtime = binding.runtime;
          if (runtime === undefined) throw new Error("Runtime was not bound");
          try {
            await runtime.flush();
          } catch (error) {
            codes.push((error as CourseRuntimeError).code);
          }
          try {
            await runtime.dispose();
          } catch (error) {
            codes.push((error as CourseRuntimeError).code);
          }
        });
        context.onDispose(async () => {
          const runtime = binding.runtime;
          if (runtime === undefined) throw new Error("Runtime was not bound");
          try {
            await runtime.dispose();
          } catch (error) {
            codes.push((error as CourseRuntimeError).code);
          }
        });
      },
    }),
  };
  const runtime = await createCourseRuntime(
    runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("reentrant", "Done")]),
      { extensions: [extension] },
    ),
  );
  binding.runtime = runtime;

  await drain(runtime.agent.prompt("Go"));
  await runtime.flush();
  expect(codes).toEqual(
    Array.from({ length: 6 }, () => "RUNTIME_REENTRANT_OPERATION"),
  );
  expect(runtime.state).toBe("open");
  await runtime.dispose();
  expect(codes.at(-1)).toBe("RUNTIME_REENTRANT_OPERATION");
});

test("keeps the old runtime public until a replacement is fully built", async () => {
  const first = await workspace("replace-first");
  const second = await workspace("replace-second");
  const candidateEntered = deferred<void>();
  const releaseCandidate = deferred<void>();
  const factories: CourseRuntimeFactoryOverrides = {
    createResources: async (input, fallback) => {
      if (input.workspace.root === resolve(second)) {
        candidateEntered.resolve();
        await releaseCandidate.promise;
      }
      return fallback(input);
    },
  };
  const manager = await createCourseRuntimeManager(
    runtimeOptions(
      first,
      new ScriptedModel([scriptedResponse("replacement", "New root")]),
      { factories },
    ),
  );
  const old = manager.current;

  const replacement = manager.replace({
    cwd: second,
    session: { path: "course-session.jsonl", mode: "create" },
  });
  await candidateEntered.promise;
  expect(manager.current).toBe(old);
  expect(manager.current.workspace.root).toBe(resolve(first));

  releaseCandidate.resolve();
  const next = await replacement;
  expect(manager.current).toBe(next);
  expect(next).not.toBe(old);
  expect(next.agent).not.toBe(old.agent);
  expect(next.session).not.toBe(old.session);
  expect(next.tools).not.toBe(old.tools);
  expect(next.extensions).not.toBe(old.extensions);
  expect(next.workspace.root).toBe(resolve(second));
  await expect(old.flush()).rejects.toMatchObject({
    code: "RUNTIME_DISPOSED",
  });
  await manager.dispose();
});

test("fails replacement closed and leaves the previous runtime live", async () => {
  const first = await workspace("closed-first");
  const second = await workspace("closed-second");
  const factories: CourseRuntimeFactoryOverrides = {
    createSession: async (input, fallback) => {
      if (input.workspace.root === resolve(second)) {
        throw new Error("candidate session failed");
      }
      return fallback(input);
    },
  };
  const model = new ScriptedModel([scriptedResponse("old-live", "Still live")]);
  const manager = await createCourseRuntimeManager(
    runtimeOptions(first, model, { factories }),
  );
  const old = manager.current;

  await expect(
    manager.replace({
      cwd: second,
      session: { path: "course-session.jsonl", mode: "create" },
    }),
  ).rejects.toMatchObject({
    name: "CourseRuntimeError",
    code: "RUNTIME_CONSTRUCTION_FAILED",
  });
  expect(manager.current).toBe(old);

  await drain(old.agent.prompt("Are you there?"));
  await old.flush();
  expect(old.session.activeMessages).toEqual(old.agent.messages);
  await manager.dispose();
});

test("rolls back a failed construction and disposes activated Extensions in reverse", async () => {
  const cwd = await workspace("rollback");
  const cleanup: string[] = [];
  const extension = (id: string): ExtensionDefinition => ({
    id,
    create: () => ({
      activate: (context) => context.onDispose(() => cleanup.push(id)),
    }),
  });
  const factories: CourseRuntimeFactoryOverrides = {
    createAgent: async () => {
      throw new Error("Agent construction failed");
    },
  };

  await expect(
    createCourseRuntime(
      runtimeOptions(cwd, new ScriptedModel([]), {
        extensions: [extension("first"), extension("second")],
        factories,
      }),
    ),
  ).rejects.toMatchObject({
    code: "RUNTIME_CONSTRUCTION_FAILED",
  });
  expect(cleanup).toEqual(["second", "first"]);
});

test("flushes before reverse disposal and makes disposal idempotent", async () => {
  const cwd = await workspace("dispose");
  const cleanup: string[] = [];
  const extension = (id: string): ExtensionDefinition => ({
    id,
    create: () => ({
      activate(context) {
        context.onDispose(() => {
          cleanup.push(id);
        });
      },
    }),
  });
  const runtime = await createCourseRuntime(
    runtimeOptions(
      cwd,
      new ScriptedModel([scriptedResponse("dispose", "Saved")]),
      { extensions: [extension("first"), extension("second")] },
    ),
  );
  await drain(runtime.agent.prompt("Persist before cleanup"));

  const firstDispose = runtime.dispose();
  const secondDispose = runtime.dispose();
  expect(secondDispose).toBe(firstDispose);
  await firstDispose;
  expect(cleanup).toEqual(["second", "first"]);
  await expect(runtime.flush()).rejects.toMatchObject({
    code: "RUNTIME_DISPOSED",
  });

  const resumed = await createCourseRuntime(
    runtimeOptions(cwd, new ScriptedModel([]), { mode: "resume" }),
  );
  expect(resumed.agent.messages.map((message) => message.role)).toEqual([
    "user",
    "assistant",
  ]);
  await resumed.dispose();
});

test("serializes concurrent replacements and rebuilds every workspace-bound part", async () => {
  const first = await workspace("queue-first");
  const second = await workspace("queue-second");
  const third = await workspace("queue-third");
  const secondEntered = deferred<void>();
  const releaseSecond = deferred<void>();
  const roots: string[] = [];
  const factories: CourseRuntimeFactoryOverrides = {
    createTools: async (input, fallback) => {
      roots.push(input.workspace.root);
      if (input.workspace.root === resolve(second)) {
        secondEntered.resolve();
        await releaseSecond.promise;
      }
      return fallback(input);
    },
  };
  const manager = await createCourseRuntimeManager(
    runtimeOptions(first, new ScriptedModel([]), { factories }),
  );

  const replaceSecond = manager.replace({
    cwd: second,
    session: { path: "course-session.jsonl", mode: "create" },
  });
  await secondEntered.promise;
  const replaceThird = manager.replace({
    cwd: third,
    session: { path: "course-session.jsonl", mode: "create" },
  });
  expect(roots).toEqual([resolve(first), resolve(second)]);

  releaseSecond.resolve();
  const secondRuntime = await replaceSecond;
  const thirdRuntime = await replaceThird;
  expect(roots).toEqual([resolve(first), resolve(second), resolve(third)]);
  expect(manager.current).toBe(thirdRuntime);
  await expect(secondRuntime.flush()).rejects.toMatchObject({
    code: "RUNTIME_DISPOSED",
  });
  await manager.dispose();
});

test("rejects reentrant manager operations from a replacement factory", async () => {
  const first = await workspace("manager-reentrant-first");
  const second = await workspace("manager-reentrant-second");
  const codes: unknown[] = [];
  const binding: {
    manager?: Awaited<ReturnType<typeof createCourseRuntimeManager>>;
  } = {};
  const factories: CourseRuntimeFactoryOverrides = {
    createResources: async (input, fallback) => {
      if (input.workspace.root === resolve(second)) {
        const manager = binding.manager;
        if (manager === undefined) throw new Error("Manager was not bound");
        try {
          await manager.flush();
        } catch (error) {
          codes.push((error as CourseRuntimeError).code);
        }
        try {
          await manager.dispose();
        } catch (error) {
          codes.push((error as CourseRuntimeError).code);
        }
      }
      return fallback(input);
    },
  };
  const manager = await createCourseRuntimeManager(
    runtimeOptions(first, new ScriptedModel([]), { factories }),
  );
  binding.manager = manager;

  const replacement = await manager.replace({
    cwd: second,
    session: { path: "course-session.jsonl", mode: "create" },
  });
  expect(manager.current).toBe(replacement);
  expect(codes).toEqual([
    "RUNTIME_REENTRANT_OPERATION",
    "RUNTIME_REENTRANT_OPERATION",
  ]);
  expect(manager.state).toBe("open");
  await manager.dispose();
});

test("disposal wins an in-flight replacement race and cleans the candidate", async () => {
  const first = await workspace("race-first");
  const second = await workspace("race-second");
  const candidateEntered = deferred<void>();
  const releaseCandidate = deferred<void>();
  const cleaned: string[] = [];
  const extension: ExtensionDefinition = {
    id: "cleanup-probe",
    create: () => ({
      activate(context) {
        context.onDispose(() =>
          cleaned.push(context.resources.roots[0].directory),
        );
      },
    }),
  };
  const factories: CourseRuntimeFactoryOverrides = {
    createAgent: async (input, fallback) => {
      if (input.workspace.root === resolve(second)) {
        candidateEntered.resolve();
        await releaseCandidate.promise;
      }
      return fallback(input);
    },
  };
  const manager = await createCourseRuntimeManager(
    runtimeOptions(first, new ScriptedModel([]), {
      factories,
      extensions: [extension],
    }),
  );
  const replacement = manager.replace({
    cwd: second,
    session: { path: "course-session.jsonl", mode: "create" },
  });
  await candidateEntered.promise;
  const disposal = manager.dispose();
  expect(manager.state).toBe("disposing");
  expect(() => manager.current).toThrowError(
    expect.objectContaining({ code: "RUNTIME_DISPOSED" }),
  );

  releaseCandidate.resolve();
  await expect(replacement).rejects.toMatchObject({ code: "RUNTIME_DISPOSED" });
  await disposal;
  expect(cleaned).toEqual([resolve(second), resolve(first)]);
  expect(manager.state).toBe("disposed");
});

test("cancels an active Agent run and waits for terminal persistence before disposal", async () => {
  const cwd = await workspace("active-dispose");
  const modelEntered = deferred<void>();
  const model: ScriptedResponseFactory = async function* (request, signal) {
    modelEntered.resolve();
    await new Promise<void>((resolveAbort) => {
      signal.addEventListener("abort", () => resolveAbort(), { once: true });
    });
    return responseFor(request, "cancelled", [], "stop");
  };
  const runtime = await createCourseRuntime(
    runtimeOptions(cwd, new ScriptedModel([model])),
  );
  const eventsPromise = drain(runtime.agent.prompt("Cancel me"));
  await modelEntered.promise;

  const firstDispose = runtime.dispose();
  expect(runtime.state).toBe("disposing");
  const events = await eventsPromise;
  await firstDispose;

  expect(events.at(-1)).toMatchObject({
    type: "run.finished",
    payload: { result: { status: "cancelled" } },
  });
  const resumed = await createCourseRuntime(
    runtimeOptions(cwd, new ScriptedModel([]), { mode: "resume" }),
  );
  expect(resumed.agent.messages).toEqual(runtime.agent.messages);
  await resumed.dispose();
});

test("adopts asynchronous factory thenables once and rejects invalid products", async () => {
  const cwd = await workspace("thenable");
  let selectionCount = 0;
  const factories: CourseRuntimeFactoryOverrides = {
    createTools(input, fallback) {
      const selectedOperation = fallback(input);
      return {
        then(resolveValue: unknown, rejectValue: unknown) {
          selectionCount += 1;
          void selectedOperation.then((value) => {
            (resolveValue as (value: unknown) => void)(value);
            (rejectValue as (reason: unknown) => void)(
              new Error("late rejection"),
            );
            (resolveValue as (value: unknown) => void)(value);
          });
          return Promise.resolve();
        },
      } as unknown as PromiseLike<Awaited<typeof selectedOperation>>;
    },
    createResources() {
      return Promise.resolve({ invalid: true } as never);
    },
  };

  await expect(
    createCourseRuntime(
      runtimeOptions(cwd, new ScriptedModel([]), { factories }),
    ),
  ).rejects.toMatchObject({
    code: "RUNTIME_CONSTRUCTION_FAILED",
  });
  expect(selectionCount).toBe(1);
});

test("rejects an outside session path and a replaced workspace identity", async () => {
  const cwd = await workspace("identity");
  const outside = await workspace("outside");
  await expect(
    createCourseRuntime({
      ...runtimeOptions(cwd, new ScriptedModel([])),
      session: { path: join(outside, "session.jsonl"), mode: "create" },
    }),
  ).rejects.toMatchObject({
    code: "RUNTIME_INVALID_OPTIONS",
  });

  const original = await workspace("replaced-root");
  const factoryEntered = deferred<void>();
  const releaseFactory = deferred<void>();
  const factories: CourseRuntimeFactoryOverrides = {
    createResources: async (input, fallback) => {
      factoryEntered.resolve();
      await releaseFactory.promise;
      return fallback(input);
    },
  };
  const construction = createCourseRuntime(
    runtimeOptions(original, new ScriptedModel([]), { factories }),
  );
  await factoryEntered.promise;
  await rm(original, { recursive: true });
  workspaces.splice(workspaces.indexOf(original), 1);
  await mkdir(original);
  workspaces.push(original);
  releaseFactory.resolve();
  await expect(construction).rejects.toMatchObject({
    code: "RUNTIME_ROOT_CHANGED",
  });
});
