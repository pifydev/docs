import { expect, test, vi } from "vitest";

import {
  COURSE_TOOL_OUTPUT_CAP_CHARACTERS,
  COURSE_TOOL_TRUNCATION_MARKER,
  NonRecoverableToolError,
  ToolContractError,
  ToolRegistry,
  defineTool,
  executeToolCall,
  type CourseTool,
  type CourseToolCall,
} from "../src/index";

type Deferred<Value> = Readonly<{
  promise: Promise<Value>;
  resolve: (value: Value | PromiseLike<Value>) => void;
}>;

function deferred<Value>(): Deferred<Value> {
  let resolve!: (value: Value | PromiseLike<Value>) => void;
  const promise = new Promise<Value>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function call(
  name: string,
  argumentsValue: CourseToolCall["arguments"] = {},
  id = `call-${name}-001`,
): CourseToolCall {
  return { type: "toolCall", id, name, arguments: argumentsValue };
}

function echoTool(name = "echo"): CourseTool<unknown, unknown> {
  return {
    name,
    description: "Return the validated input.",
    validate: (input) => ({ ok: true, value: input }),
    execute: async (input) => input,
  };
}

test("defineTool snapshots its four own fields once and freezes the definition", async () => {
  const reads = { name: 0, description: 0, validate: 0, execute: 0 };
  const validate = (input: unknown) => ({ ok: true as const, value: input });
  const execute = async (input: unknown) => input;
  const hostile = {} as CourseTool<unknown, unknown>;
  Object.defineProperties(hostile, {
    name: {
      enumerable: true,
      get() {
        reads.name += 1;
        return reads.name === 1 ? "snapshot" : "changed";
      },
    },
    description: {
      enumerable: true,
      get() {
        reads.description += 1;
        return reads.description === 1 ? "Stable description." : "changed";
      },
    },
    validate: {
      enumerable: true,
      get() {
        reads.validate += 1;
        return validate;
      },
    },
    execute: {
      enumerable: true,
      get() {
        reads.execute += 1;
        return execute;
      },
    },
  });

  const snapshot = defineTool(hostile);

  expect(snapshot).toMatchObject({
    name: "snapshot",
    description: "Stable description.",
  });
  expect(reads).toEqual({ name: 1, description: 1, validate: 1, execute: 1 });
  expect(Object.isFrozen(snapshot)).toBe(true);
  await expect(
    snapshot.execute("value", {
      signal: new AbortController().signal,
      toolCallId: "call-snapshot-001",
    }),
  ).resolves.toBe("value");
});

test("defineTool rejects inherited fields without invoking inherited getters", () => {
  let inheritedReads = 0;
  const prototype = Object.defineProperty({}, "name", {
    get() {
      inheritedReads += 1;
      throw new Error("inherited getter must not run");
    },
  });
  const definition = Object.assign(Object.create(prototype), {
    description: "Missing an own name.",
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input: unknown) => input,
  });

  expect(() => defineTool(definition)).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "INVALID_TOOL_DEFINITION",
    }),
  );
  expect(inheritedReads).toBe(0);
});

test("wraps hostile thrown values without inspecting their prototype", () => {
  const revoked = Proxy.revocable({}, {});
  revoked.revoke();
  const definition = {
    get name(): string {
      throw revoked.proxy;
    },
    description: "Throw a revoked Proxy.",
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input: unknown) => input,
  };

  expect(() => defineTool(definition)).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "INVALID_TOOL_DEFINITION",
    }),
  );
});

test("registerMany validates an entire hostile batch before one atomic mutation", () => {
  const registry = new ToolRegistry([echoTool("existing")]);
  const definitions = [echoTool("first"), echoTool("second")];
  let iteratorReads = 0;
  let mapReads = 0;
  let secondNameReads = 0;
  Object.defineProperty(definitions, Symbol.iterator, {
    value() {
      iteratorReads += 1;
      throw new Error("registerMany must use indexed traversal");
    },
  });
  Object.defineProperty(definitions, "map", {
    value() {
      mapReads += 1;
      throw new Error("registerMany must not trust array methods");
    },
  });
  Object.defineProperty(definitions[1], "name", {
    configurable: true,
    enumerable: true,
    get() {
      secondNameReads += 1;
      throw new Error("hostile definition");
    },
  });

  expect(() => registry.registerMany(definitions)).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "INVALID_TOOL_DEFINITION",
    }),
  );
  expect(registry.names).toEqual(["existing"]);
  expect(iteratorReads).toBe(0);
  expect(mapReads).toBe(0);
  expect(secondNameReads).toBe(1);

  const sparse = [echoTool("never-added"), echoTool("hole")];
  delete sparse[1];
  expect(() => registry.registerMany(sparse)).toThrowError(
    expect.objectContaining({ code: "INVALID_TOOL_BATCH" }),
  );
  expect(registry.names).toEqual(["existing"]);
});

test("registerMany rejects duplicate names inside a batch and against the registry", () => {
  const registry = new ToolRegistry([echoTool("existing")]);

  expect(() =>
    registry.registerMany([echoTool("new"), echoTool("new")]),
  ).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "DUPLICATE_TOOL_NAME",
    }),
  );
  expect(registry.names).toEqual(["existing"]);

  expect(() =>
    registry.registerMany([echoTool("candidate"), echoTool("existing")]),
  ).toThrowError(expect.objectContaining({ code: "DUPLICATE_TOOL_NAME" }));
  expect(registry.names).toEqual(["existing"]);
});

test("registry owns immutable Tool snapshots instead of caller aliases", async () => {
  const source = echoTool("mutable-before-registration");
  const registry = new ToolRegistry();
  registry.register(source);
  Reflect.set(source, "name", "mutated-after-registration");
  Reflect.set(source, "description", "mutated");

  expect(registry.names).toEqual(["mutable-before-registration"]);
  expect(Object.isFrozen(registry.names)).toBe(true);
  expect(registry.get("mutable-before-registration")).toMatchObject({
    name: "mutable-before-registration",
    description: "Return the validated input.",
  });
  await expect(
    executeToolCall(
      registry,
      call("mutable-before-registration", { value: 1 }),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({ isError: false, content: '{"value":1}' });
});

test("unknown Tools become linked error results rather than registry mutations", async () => {
  const registry = new ToolRegistry();

  await expect(
    executeToolCall(
      registry,
      call("missing", {}, "call-stable-missing"),
      new AbortController().signal,
    ),
  ).resolves.toEqual({
    id: "tool-result-call-stable-missing",
    role: "toolResult",
    toolCallId: "call-stable-missing",
    toolName: "missing",
    content:
      '{"error":{"code":"TOOL_NOT_FOUND","message":"Unknown Tool \\"missing\\""}}',
    isError: true,
  });
  expect(registry.size).toBe(0);
});

test("argument validation runs before effects and preserves validation details", async () => {
  const execute = vi.fn(async () => ({ unreachable: true }));
  const registry = new ToolRegistry([
    defineTool({
      name: "add",
      description: "Add numbers.",
      validate: () => ({ ok: false, error: "left must be a number" }),
      execute,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("add", { left: "twenty", right: 22 }, "call-invalid-add"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    toolCallId: "call-invalid-add",
    toolName: "add",
    isError: true,
    content:
      '{"error":{"code":"TOOL_ARGUMENTS_INVALID","message":"left must be a number"}}',
  });
  expect(execute).not.toHaveBeenCalled();
});

test("successful structured output is deterministic, linked, and immutable", async () => {
  const registry = new ToolRegistry([
    defineTool({
      name: "add",
      description: "Add numbers.",
      validate(input) {
        const value = input as { left?: unknown; right?: unknown };
        return typeof value.left === "number" && typeof value.right === "number"
          ? { ok: true, value: { left: value.left, right: value.right } }
          : { ok: false, error: "left and right must be numbers" };
      },
      execute: async ({ left, right }) => ({ sum: left + right, exact: true }),
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("add", { left: 20, right: 22 }, "call-add-structured"),
    new AbortController().signal,
  );

  expect(result).toEqual({
    id: "tool-result-call-add-structured",
    role: "toolResult",
    toolCallId: "call-add-structured",
    toolName: "add",
    content: '{"exact":true,"sum":42}',
    isError: false,
  });
  expect(Object.isFrozen(result)).toBe(true);
});

test("ordinary Tool throws are normalized while marked programmer errors propagate", async () => {
  const recoverable = new Error("fixture service unavailable");
  const fatal = new NonRecoverableToolError("Tool invariant failed");
  const registry = new ToolRegistry([
    defineTool({
      name: "recoverable",
      description: "Fail normally.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => {
        throw recoverable;
      },
    }),
    defineTool({
      name: "programmer-error",
      description: "Fail outside the recoverable boundary.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => {
        throw fatal;
      },
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("recoverable"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content:
      '{"error":{"code":"TOOL_EXECUTION_FAILED","message":"fixture service unavailable"}}',
  });
  await expect(
    executeToolCall(
      registry,
      call("programmer-error"),
      new AbortController().signal,
    ),
  ).rejects.toBe(fatal);
  expect(fatal).toMatchObject({
    name: "NonRecoverableToolError",
    code: "NON_RECOVERABLE_TOOL_ERROR",
    nonRecoverable: true,
  });
});

test("normalizes validators that throw or return malformed decisions", async () => {
  const throwing = new Error("validator failed");
  const registry = new ToolRegistry([
    defineTool({
      name: "throwing-validator",
      description: "Throw while validating.",
      validate: () => {
        throw throwing;
      },
      execute: async () => "unreachable",
    }),
    defineTool({
      name: "malformed-validator",
      description: "Return an invalid decision.",
      validate: () => ({ ok: "yes" }) as never,
      execute: async () => "unreachable",
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("throwing-validator"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content:
      '{"error":{"code":"TOOL_VALIDATION_FAILED","message":"validator failed"}}',
  });
  await expect(
    executeToolCall(
      registry,
      call("malformed-validator"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content: expect.stringContaining("TOOL_VALIDATION_FAILED"),
  });
});

test("propagates cancellation before validation without invoking the Tool", async () => {
  const validate = vi.fn((input: unknown) => ({
    ok: true as const,
    value: input,
  }));
  const execute = vi.fn(async () => "unreachable");
  const registry = new ToolRegistry([
    defineTool({
      name: "cancel-before",
      description: "Never starts.",
      validate,
      execute,
    }),
  ]);
  const controller = new AbortController();
  const reason = new DOMException("cancel before validation", "AbortError");
  controller.abort(reason);

  await expect(
    executeToolCall(registry, call("cancel-before"), controller.signal),
  ).rejects.toBe(reason);
  expect(validate).not.toHaveBeenCalled();
  expect(execute).not.toHaveBeenCalled();
});

test("lets cancellation win when a hostile Tool-call getter aborts and throws", async () => {
  const controller = new AbortController();
  const reason = new DOMException("cancel while snapshotting", "AbortError");
  const hostileCall = {
    type: "toolCall",
    id: "call-hostile-snapshot",
    get name(): string {
      controller.abort(reason);
      throw new Error("secondary getter failure");
    },
    arguments: {},
  } as CourseToolCall;

  await expect(
    executeToolCall(new ToolRegistry(), hostileCall, controller.signal),
  ).rejects.toBe(reason);
});

test("propagates cancellation between validation and execution", async () => {
  const controller = new AbortController();
  const reason = new DOMException("cancel before execute", "AbortError");
  const execute = vi.fn(async () => "unreachable");
  const registry = new ToolRegistry([
    defineTool({
      name: "cancel-after-validation",
      description: "Validation cancels the operation.",
      validate: (input) => {
        controller.abort(reason);
        return { ok: true, value: input };
      },
      execute,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("cancel-after-validation"),
      controller.signal,
    ),
  ).rejects.toBe(reason);
  expect(execute).not.toHaveBeenCalled();
});

test("propagates cancellation while a rejected validation is inspected", async () => {
  const controller = new AbortController();
  const reason = new DOMException("cancel while inspecting", "AbortError");
  const execute = vi.fn(async () => "unreachable");
  const registry = new ToolRegistry([
    defineTool({
      name: "cancel-validation-decision",
      description: "Cancel through a validation getter.",
      validate: () => ({
        ok: false as const,
        get error(): string {
          controller.abort(reason);
          return "must not become a Tool result";
        },
      }),
      execute,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("cancel-validation-decision"),
      controller.signal,
    ),
  ).rejects.toBe(reason);
  expect(execute).not.toHaveBeenCalled();
});

test("interrupts execution through AbortSignal without timers", async () => {
  const entered = deferred<void>();
  const never = deferred<unknown>();
  let receivedSignal: AbortSignal | undefined;
  const registry = new ToolRegistry([
    defineTool({
      name: "cancel-during",
      description: "Wait for cancellation.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async (_input, context) => {
        receivedSignal = context.signal;
        entered.resolve();
        return never.promise;
      },
    }),
  ]);
  const controller = new AbortController();
  const reason = new DOMException("cancel during execute", "AbortError");
  const pending = executeToolCall(
    registry,
    call("cancel-during"),
    controller.signal,
  );
  await entered.promise;

  controller.abort(reason);

  await expect(pending).rejects.toBe(reason);
  expect(receivedSignal).toBe(controller.signal);
});

test("checks cancellation after resolution and safe output inspection", async () => {
  const controller = new AbortController();
  const reason = new DOMException("cancel during output", "AbortError");
  const output = new Proxy(
    { value: 42 },
    {
      ownKeys(target) {
        controller.abort(reason);
        return Reflect.ownKeys(target);
      },
    },
  );
  const registry = new ToolRegistry([
    defineTool({
      name: "cancel-after-resolution",
      description: "Cancel as output is inspected.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("cancel-after-resolution"),
      controller.signal,
    ),
  ).rejects.toBe(reason);
});

test("serializes hostile structured output without getters, toJSON, prototypes, or crashes", async () => {
  let getterReads = 0;
  let toJsonCalls = 0;
  let inheritedReads = 0;
  const prototype = Object.defineProperty({}, "inherited", {
    enumerable: true,
    get() {
      inheritedReads += 1;
      throw new Error("prototype must not be read");
    },
  });
  const output = Object.create(prototype) as Record<string, unknown>;
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  Object.defineProperties(output, {
    zUndefined: { enumerable: true, value: undefined },
    aBigInt: { enumerable: true, value: BigInt("9007199254740993") },
    cycle: { enumerable: true, value: cycle },
    getter: {
      enumerable: true,
      get() {
        getterReads += 1;
        throw new Error("getter must not run");
      },
    },
    toJSON: {
      enumerable: true,
      value() {
        toJsonCalls += 1;
        throw new Error("toJSON must not run");
      },
    },
  });
  const registry = new ToolRegistry([
    defineTool({
      name: "safe-json",
      description: "Return hostile structured data.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  const first = await executeToolCall(
    registry,
    call("safe-json"),
    new AbortController().signal,
  );
  const second = await executeToolCall(
    registry,
    call("safe-json", {}, "call-safe-json-002"),
    new AbortController().signal,
  );

  expect(first.content).toBe(
    '{"aBigInt":"9007199254740993n","cycle":{"self":"[Circular]"},"getter":"[Accessor omitted]","toJSON":"[Function]","zUndefined":"[Undefined]"}',
  );
  expect(second.content).toBe(first.content);
  expect(getterReads).toBe(0);
  expect(toJsonCalls).toBe(0);
  expect(inheritedReads).toBe(0);
});

test("bounds output to 4096 Unicode characters including one deterministic marker", async () => {
  const registry = new ToolRegistry([
    defineTool({
      name: "large-output",
      description: "Return more than the course output cap.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => "🙂".repeat(COURSE_TOOL_OUTPUT_CAP_CHARACTERS),
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("large-output"),
    new AbortController().signal,
  );

  expect(COURSE_TOOL_OUTPUT_CAP_CHARACTERS).toBe(4096);
  expect([...result.content]).toHaveLength(COURSE_TOOL_OUTPUT_CAP_CHARACTERS);
  expect(result.content.endsWith(COURSE_TOOL_TRUNCATION_MARKER)).toBe(true);
  expect(result.content.match(/\[Tool output truncated\]/gu)).toHaveLength(1);
});

test("snapshots Tool calls before validation and ignores caller mutation", async () => {
  const release = deferred<void>();
  let validated: unknown;
  const argumentsValue = { nested: { value: 1 } };
  const registry = new ToolRegistry([
    defineTool({
      name: "snapshot-call",
      description: "Observe immutable arguments.",
      validate(input) {
        validated = input;
        return { ok: true, value: input };
      },
      execute: async (input) => {
        await release.promise;
        return input;
      },
    }),
  ]);

  const pending = executeToolCall(
    registry,
    call("snapshot-call", argumentsValue),
    new AbortController().signal,
  );
  argumentsValue.nested.value = 999;
  release.resolve();

  await expect(pending).resolves.toMatchObject({
    content: '{"nested":{"value":1}}',
  });
  expect(validated).toEqual({ nested: { value: 1 } });
  expect(Object.isFrozen(validated)).toBe(true);
  expect(Object.isFrozen((validated as { nested: object }).nested)).toBe(true);
});

test("parallel executions do not mutate or cross-wire the registry", async () => {
  const firstRelease = deferred<void>();
  const secondRelease = deferred<void>();
  const registry = new ToolRegistry([
    defineTool({
      name: "parallel",
      description: "Resolve calls independently.",
      validate: (input) => ({ ok: true, value: input as { value: number } }),
      execute: async (input) => {
        await (input.value === 1
          ? firstRelease.promise
          : secondRelease.promise);
        return input;
      },
    }),
  ]);
  const first = executeToolCall(
    registry,
    call("parallel", { value: 1 }, "call-parallel-001"),
    new AbortController().signal,
  );
  const second = executeToolCall(
    registry,
    call("parallel", { value: 2 }, "call-parallel-002"),
    new AbortController().signal,
  );

  secondRelease.resolve();
  await expect(second).resolves.toMatchObject({
    toolCallId: "call-parallel-002",
    content: '{"value":2}',
  });
  firstRelease.resolve();
  await expect(first).resolves.toMatchObject({
    toolCallId: "call-parallel-001",
    content: '{"value":1}',
  });
  expect(registry.names).toEqual(["parallel"]);
  expect(registry.size).toBe(1);
});

test("ToolContractError exposes stable readonly registry boundary codes", () => {
  const error = new ToolContractError(
    "INVALID_TOOL_BATCH",
    "Tool batch must not be sparse",
  );

  expect(error).toMatchObject({
    name: "ToolContractError",
    code: "INVALID_TOOL_BATCH",
    message: "Tool batch must not be sparse",
  });
});
