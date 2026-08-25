import { expect, test, vi } from "vitest";

import {
  COURSE_TOOL_OUTPUT_CAP_CHARACTERS,
  COURSE_TOOL_SERIALIZATION_MAX_COLLECTION_ENTRIES,
  COURSE_TOOL_SERIALIZATION_MAX_BIGINT_BITS,
  COURSE_TOOL_SERIALIZATION_MAX_DEPTH,
  COURSE_TOOL_SERIALIZATION_MAX_NODES,
  COURSE_TOOL_SERIALIZATION_MAX_STRING_CHARACTERS,
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
  const runtimeProcess = Reflect.get(globalThis, "process");
  if (typeof runtimeProcess !== "object" || runtimeProcess === null) {
    throw new Error("Node process is unavailable");
  }
  const on = Reflect.get(runtimeProcess, "on");
  const removeListener = Reflect.get(runtimeProcess, "removeListener");
  if (typeof on !== "function" || typeof removeListener !== "function") {
    throw new Error("Node process event methods are unavailable");
  }
  Reflect.apply(on, runtimeProcess, ["unhandledRejection", listener]);
  return () => {
    Reflect.apply(removeListener, runtimeProcess, [
      "unhandledRejection",
      listener,
    ]);
  };
}

function toolSource(): string {
  const runtimeProcess = Reflect.get(globalThis, "process");
  if (typeof runtimeProcess !== "object" || runtimeProcess === null) {
    throw new Error("Node process is unavailable");
  }
  const getBuiltinModule = Reflect.get(runtimeProcess, "getBuiltinModule");
  if (typeof getBuiltinModule !== "function") {
    throw new Error("process.getBuiltinModule() is unavailable");
  }
  const fileSystem: unknown = Reflect.apply(getBuiltinModule, runtimeProcess, [
    "node:fs",
  ]);
  if (typeof fileSystem !== "object" || fileSystem === null) {
    throw new Error("node:fs is unavailable");
  }
  const readFileSync = Reflect.get(fileSystem, "readFileSync");
  if (typeof readFileSync !== "function") {
    throw new Error("node:fs.readFileSync() is unavailable");
  }
  const source: unknown = Reflect.apply(readFileSync, fileSystem, [
    new URL("../src/tool.ts", import.meta.url),
    "utf8",
  ]);
  if (typeof source !== "string") {
    throw new Error("tool.ts was not read as text");
  }
  return source;
}

function runInNewContext(source: string): unknown {
  const runtimeProcess = Reflect.get(globalThis, "process");
  if (typeof runtimeProcess !== "object" || runtimeProcess === null) {
    throw new Error("Node process is unavailable");
  }
  const getBuiltinModule = Reflect.get(runtimeProcess, "getBuiltinModule");
  if (typeof getBuiltinModule !== "function") {
    throw new Error("process.getBuiltinModule() is unavailable");
  }
  const virtualMachine: unknown = Reflect.apply(
    getBuiltinModule,
    runtimeProcess,
    ["node:vm"],
  );
  if (typeof virtualMachine !== "object" || virtualMachine === null) {
    throw new Error("node:vm is unavailable");
  }
  const run = Reflect.get(virtualMachine, "runInNewContext");
  if (typeof run !== "function") {
    throw new Error("node:vm.runInNewContext() is unavailable");
  }
  return Reflect.apply(run, virtualMachine, [source]);
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

test("normalizes revoked batch Proxies as INVALID_TOOL_BATCH", () => {
  const revoked = Proxy.revocable([], {});
  revoked.revoke();

  expect(
    () => new ToolRegistry(revoked.proxy as readonly unknown[]),
  ).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "INVALID_TOOL_BATCH",
    }),
  );
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

test("rejects async validators immediately while observing their rejection", async () => {
  const rejection = new Error("async validator rejected later");
  const execute = vi.fn(async () => "unreachable");
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const stopListening = listenForUnhandledRejections(onUnhandled);

  try {
    const registry = new ToolRegistry([
      defineTool({
        name: "async-validator",
        description: "Invalid asynchronous validator.",
        validate: () => Promise.reject(rejection) as never,
        execute,
      }),
    ]);

    await expect(
      executeToolCall(
        registry,
        call("async-validator"),
        new AbortController().signal,
      ),
    ).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("TOOL_VALIDATION_FAILED"),
    });
    await nextEventLoopTurn();
    expect(unhandled).toEqual([]);
    expect(execute).not.toHaveBeenCalled();
  } finally {
    stopListening();
  }
});

test("observes hostile validator then getters, calls, and returned rejections", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const stopListening = listenForUnhandledRejections(onUnhandled);
  let getterReads = 0;
  let callCount = 0;
  const getterThenable = Object.defineProperty({}, "then", {
    get() {
      getterReads += 1;
      throw new Error("hostile then getter");
    },
  });
  const callingThenable = {
    then() {
      callCount += 1;
      return Promise.reject(new Error("hostile returned rejection"));
    },
  };
  const registry = new ToolRegistry([
    defineTool({
      name: "then-getter-validator",
      description: "Invalid then getter.",
      validate: () => getterThenable as never,
      execute: async () => "unreachable",
    }),
    defineTool({
      name: "then-call-validator",
      description: "Invalid then call.",
      validate: () => callingThenable as never,
      execute: async () => "unreachable",
    }),
  ]);

  try {
    for (const name of ["then-getter-validator", "then-call-validator"]) {
      await expect(
        executeToolCall(registry, call(name), new AbortController().signal),
      ).resolves.toMatchObject({
        isError: true,
        content: expect.stringContaining("TOOL_VALIDATION_FAILED"),
      });
    }
    await nextEventLoopTurn();
    expect(getterReads).toBe(1);
    expect(callCount).toBe(1);
    expect(unhandled).toEqual([]);
  } finally {
    stopListening();
  }
});

test("uses captured Promise intrinsics for shadowed and prototype-patched native rejections", async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const stopListening = listenForUnhandledRejections(onUnhandled);
  const originalThen = Object.getOwnPropertyDescriptor(
    Promise.prototype,
    "then",
  );
  const originalResolve = Object.getOwnPropertyDescriptor(Promise, "resolve");
  if (originalThen === undefined || originalResolve === undefined) {
    stopListening();
    throw new Error("Promise intrinsic descriptors are unavailable");
  }

  try {
    const validationRejection = new Error("native validation rejection");
    const invalidValidation = Promise.reject(validationRejection);
    Object.defineProperty(invalidValidation, "then", {
      configurable: true,
      value: undefined,
    });
    const validationRegistry = new ToolRegistry([
      defineTool({
        name: "shadowed-validation-promise",
        description: "Return an invalid native Promise validator.",
        validate: () => invalidValidation as never,
        execute: async () => "unreachable",
      }),
    ]);
    Object.defineProperty(Promise.prototype, "then", {
      configurable: true,
      value() {
        throw new Error("patched Promise.prototype.then must be ignored");
      },
    });
    Object.defineProperty(Promise, "resolve", {
      configurable: true,
      value() {
        throw new Error("patched Promise.resolve must be ignored");
      },
    });
    let validationExecution: Promise<unknown>;
    try {
      validationExecution = executeToolCall(
        validationRegistry,
        call("shadowed-validation-promise"),
        new AbortController().signal,
      );
    } finally {
      Object.defineProperty(Promise.prototype, "then", originalThen);
      Object.defineProperty(Promise, "resolve", originalResolve);
    }
    await expect(validationExecution).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("TOOL_VALIDATION_FAILED"),
    });

    const executionRejection = new Error("native execute rejection");
    const invalidExecution = Promise.reject(executionRejection);
    Object.defineProperty(invalidExecution, "then", {
      configurable: true,
      value: undefined,
    });
    const executionRegistry = new ToolRegistry([
      defineTool({
        name: "shadowed-execution-promise",
        description: "Reject through captured Promise intrinsics.",
        validate: (input) => ({ ok: true, value: input }),
        execute: () => invalidExecution,
      }),
    ]);
    Object.defineProperty(Promise.prototype, "then", {
      configurable: true,
      value() {
        throw new Error("patched Promise.prototype.then must be ignored");
      },
    });
    Object.defineProperty(Promise, "resolve", {
      configurable: true,
      value() {
        throw new Error("patched Promise.resolve must be ignored");
      },
    });
    let toolExecution: Promise<unknown>;
    try {
      toolExecution = executeToolCall(
        executionRegistry,
        call("shadowed-execution-promise"),
        new AbortController().signal,
      );
    } finally {
      Object.defineProperty(Promise.prototype, "then", originalThen);
      Object.defineProperty(Promise, "resolve", originalResolve);
    }
    await expect(toolExecution).resolves.toMatchObject({
      isError: true,
      content: expect.stringContaining("native execute rejection"),
    });
    await nextEventLoopTurn();
    expect(unhandled).toEqual([]);
  } finally {
    Object.defineProperty(Promise.prototype, "then", originalThen);
    Object.defineProperty(Promise, "resolve", originalResolve);
    await nextEventLoopTurn();
    stopListening();
  }
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

test("observes a secondary Tool rejection when execution synchronously aborts", async () => {
  const controller = new AbortController();
  const abortReason = new DOMException("primary cancellation", "AbortError");
  const secondary = new Error("secondary Tool rejection");
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  const stopListening = listenForUnhandledRejections(onUnhandled);
  const registry = new ToolRegistry([
    defineTool({
      name: "abort-and-reject",
      description: "Abort while returning a rejected promise.",
      validate: (input) => ({ ok: true, value: input }),
      execute: () => {
        controller.abort(abortReason);
        return Promise.reject(secondary);
      },
    }),
  ]);

  try {
    await expect(
      executeToolCall(registry, call("abort-and-reject"), controller.signal),
    ).rejects.toBe(abortReason);
    await nextEventLoopTurn();
    expect(unhandled).toEqual([]);
  } finally {
    stopListening();
  }
});

test.each(["getter", "call"] as const)(
  "does not trust an overridden addEventListener %s and settles once",
  async (overrideKind) => {
    const controller = new AbortController();
    const abortReason = new DOMException(
      "abort through intrinsic",
      "AbortError",
    );
    const secondary = new Error("observed after abort");
    let overrideUses = 0;
    if (overrideKind === "getter") {
      Object.defineProperty(controller.signal, "addEventListener", {
        get() {
          overrideUses += 1;
          throw new Error("hostile addEventListener getter");
        },
      });
    } else {
      Object.defineProperty(controller.signal, "addEventListener", {
        value() {
          overrideUses += 1;
          throw new Error("hostile addEventListener call");
        },
      });
    }
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    const stopListening = listenForUnhandledRejections(onUnhandled);
    const registry = new ToolRegistry([
      defineTool({
        name: `hostile-add-${overrideKind}`,
        description: "Use captured EventTarget intrinsics.",
        validate: (input) => ({ ok: true, value: input }),
        execute: () => {
          controller.abort(abortReason);
          return Promise.reject(secondary);
        },
      }),
    ]);
    let settlements = 0;

    try {
      const execution = executeToolCall(
        registry,
        call(`hostile-add-${overrideKind}`),
        controller.signal,
      );
      void execution.then(
        () => {
          settlements += 1;
        },
        () => {
          settlements += 1;
        },
      );
      await expect(execution).rejects.toBe(abortReason);
      await nextEventLoopTurn();
      expect(overrideUses).toBe(0);
      expect(settlements).toBe(1);
      expect(unhandled).toEqual([]);
    } finally {
      stopListening();
    }
  },
);

test.each(["getter", "call"] as const)(
  "does not trust an overridden removeEventListener %s or leave execution pending",
  async (overrideKind) => {
    const controller = new AbortController();
    let overrideUses = 0;
    if (overrideKind === "getter") {
      Object.defineProperty(controller.signal, "removeEventListener", {
        get() {
          overrideUses += 1;
          throw new Error("hostile removeEventListener getter");
        },
      });
    } else {
      Object.defineProperty(controller.signal, "removeEventListener", {
        value() {
          overrideUses += 1;
          throw new Error("hostile removeEventListener call");
        },
      });
    }
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    const stopListening = listenForUnhandledRejections(onUnhandled);
    const registry = new ToolRegistry([
      defineTool({
        name: `hostile-remove-${overrideKind}`,
        description: "Settle despite hostile cleanup methods.",
        validate: (input) => ({ ok: true, value: input }),
        execute: async () => ({ settled: true }),
      }),
    ]);
    let outcome: "pending" | "fulfilled" | "rejected" = "pending";
    const execution = executeToolCall(
      registry,
      call(`hostile-remove-${overrideKind}`),
      controller.signal,
    );
    void execution.then(
      () => {
        outcome = "fulfilled";
      },
      () => {
        outcome = "rejected";
      },
    );

    try {
      await nextEventLoopTurn();
      expect(outcome).toBe("fulfilled");
      expect(overrideUses).toBe(0);
      expect(unhandled).toEqual([]);
    } finally {
      controller.abort();
      stopListening();
    }
  },
);

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
  const inheritedKey = "__course_tool_inherited_trap__";
  const priorInheritedDescriptor = Object.getOwnPropertyDescriptor(
    Object.prototype,
    inheritedKey,
  );
  Object.defineProperty(Object.prototype, inheritedKey, {
    configurable: true,
    enumerable: false,
    get() {
      inheritedReads += 1;
      throw new Error("prototype must not be read");
    },
  });
  const output = {} as Record<string, unknown>;
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

  try {
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
      '{"aBigInt":"9007199254740993n","cycle":{"self":"[Circular]"},"toJSON":"[Function]","zUndefined":"[Undefined]"}',
    );
    expect(second.content).toBe(first.content);
    expect(getterReads).toBe(0);
    expect(toJsonCalls).toBe(0);
    expect(inheritedReads).toBe(0);
  } finally {
    if (priorInheritedDescriptor === undefined) {
      Reflect.deleteProperty(Object.prototype, inheritedKey);
    } else {
      Object.defineProperty(
        Object.prototype,
        inheritedKey,
        priorInheritedDescriptor,
      );
    }
  }
});

test.each([
  ["Date", new Date("2026-08-25T00:00:00.000Z")],
  ["Map", new Map([["key", "value"]])],
  ["Set", new Set(["value"])],
  ["RegExp", /unsupported/u],
  ["boxed primitive", new String("unsupported")],
  ["class instance", new (class UnsupportedOutput {})()],
] as const)("rejects unsupported %s Tool output", async (_label, output) => {
  const registry = new ToolRegistry([
    defineTool({
      name: "unsupported-output",
      description: "Return a non-plain object.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("unsupported-output"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content: expect.stringContaining("TOOL_OUTPUT_SERIALIZATION_FAILED"),
  });
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

test("bounds serializer work for an 8-million-character string", async () => {
  const huge = "x".repeat(8_000_000);
  const registry = new ToolRegistry([
    defineTool({
      name: "huge-string",
      description: "Exercise bounded string consumption.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => huge,
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("huge-string"),
    new AbortController().signal,
  );

  expect(result.isError).toBe(false);
  expect([...result.content]).toHaveLength(COURSE_TOOL_OUTPUT_CAP_CHARACTERS);
  expect(result.content.endsWith(COURSE_TOOL_TRUNCATION_MARKER)).toBe(true);
  expect(COURSE_TOOL_SERIALIZATION_MAX_STRING_CHARACTERS).toBe(4096);
});

test("bounds sparse-array descriptor visits instead of walking a million slots", async () => {
  let descriptorVisits = 0;
  const sparse = new Array(1_000_000);
  const output = new Proxy(sparse, {
    getOwnPropertyDescriptor(target, property) {
      descriptorVisits += 1;
      return Reflect.getOwnPropertyDescriptor(target, property);
    },
  });
  const registry = new ToolRegistry([
    defineTool({
      name: "sparse-output",
      description: "Exercise collection visit limits.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("sparse-output"),
    new AbortController().signal,
  );

  expect(result.isError).toBe(false);
  expect(result.content.endsWith(COURSE_TOOL_TRUNCATION_MARKER)).toBe(true);
  expect(COURSE_TOOL_SERIALIZATION_MAX_COLLECTION_ENTRIES).toBe(256);
  expect(descriptorVisits).toBeLessThanOrEqual(
    COURSE_TOOL_SERIALIZATION_MAX_COLLECTION_ENTRIES + 2,
  );
});

test("bounds deep and wide output with explicit depth and node budgets", async () => {
  const deep: Record<string, unknown> = {};
  let cursor = deep;
  for (let depth = 0; depth < 100_000; depth += 1) {
    const next: Record<string, unknown> = {};
    cursor.next = next;
    cursor = next;
  }
  const wide = Array.from(
    { length: COURSE_TOOL_SERIALIZATION_MAX_NODES + 100 },
    () => ({}),
  );
  const registry = new ToolRegistry([
    defineTool({
      name: "deep-output",
      description: "Exercise depth limits.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => deep,
    }),
    defineTool({
      name: "wide-output",
      description: "Exercise node limits.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => wide,
    }),
  ]);

  for (const name of ["deep-output", "wide-output"]) {
    await expect(
      executeToolCall(registry, call(name), new AbortController().signal),
    ).resolves.toMatchObject({
      isError: false,
      content: expect.stringMatching(/\[Tool output truncated\]$/u),
    });
  }
  expect(COURSE_TOOL_SERIALIZATION_MAX_DEPTH).toBe(32);
  expect(COURSE_TOOL_SERIALIZATION_MAX_NODES).toBe(128);
});

test("enumerates a 250k-key plain object without eager full-key APIs", async () => {
  const output = Object.create(null) as Record<string, unknown>;
  for (let index = 0; index < 250_000; index += 1) {
    output[`key-${index.toString().padStart(6, "0")}`] = index;
  }
  const registry = new ToolRegistry([
    defineTool({
      name: "huge-object",
      description: "Exercise bounded own-property enumeration.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("huge-object"),
    new AbortController().signal,
  );

  expect(result.isError).toBe(false);
  expect([...result.content].length).toBeLessThanOrEqual(
    COURSE_TOOL_OUTPUT_CAP_CHARACTERS,
  );
  expect(result.content.endsWith(COURSE_TOOL_TRUNCATION_MARKER)).toBe(true);
  expect(toolSource()).not.toMatch(/\b(?:Reflect\.ownKeys|Object\.keys)\b/u);
});

test("uses explicit JSON property semantics without invoking accessors", async () => {
  let accessorReads = 0;
  let toJsonCalls = 0;
  const symbolKey = Symbol("ignored");
  const output = { visible: 1 } as Record<PropertyKey, unknown>;
  Object.defineProperties(output, {
    hidden: { enumerable: false, value: "ignored" },
    accessor: {
      enumerable: true,
      get() {
        accessorReads += 1;
        return "must not be read";
      },
    },
    toJSON: {
      enumerable: true,
      value() {
        toJsonCalls += 1;
        return { replaced: true };
      },
    },
  });
  output[symbolKey] = "ignored";
  const registry = new ToolRegistry([
    defineTool({
      name: "json-property-semantics",
      description: "Inspect only own enumerable string properties.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => output,
    }),
  ]);

  const result = await executeToolCall(
    registry,
    call("json-property-semantics"),
    new AbortController().signal,
  );

  expect(result.content).toBe('{"toJSON":"[Function]","visible":1}');
  expect(accessorReads).toBe(0);
  expect(toJsonCalls).toBe(0);
});

test("bounds BigInt magnitude before decimal conversion", async () => {
  const one = BigInt(1);
  const accepted =
    (one << BigInt(COURSE_TOOL_SERIALIZATION_MAX_BIGINT_BITS)) - one;
  const oversized = one << BigInt(2_000_000);
  const registry = new ToolRegistry([
    defineTool({
      name: "bounded-bigint",
      description: "Serialize only bounded BigInt magnitudes.",
      validate(input) {
        const value = input as { oversized?: unknown };
        return { ok: true, value: value.oversized === true };
      },
      execute: async (useOversized) => (useOversized ? oversized : accepted),
    }),
  ]);

  const acceptedResult = await executeToolCall(
    registry,
    call("bounded-bigint", { oversized: false }),
    new AbortController().signal,
  );
  const oversizedResult = await executeToolCall(
    registry,
    call("bounded-bigint", { oversized: true }, "call-bigint-oversized"),
    new AbortController().signal,
  );

  expect(COURSE_TOOL_SERIALIZATION_MAX_BIGINT_BITS).toBe(4096);
  expect(acceptedResult.isError).toBe(false);
  expect(acceptedResult.content.endsWith('n"')).toBe(true);
  expect(acceptedResult.content).not.toContain(COURSE_TOOL_TRUNCATION_MARKER);
  expect(oversizedResult.isError).toBe(false);
  expect(oversizedResult.content).toBe(COURSE_TOOL_TRUNCATION_MARKER);
});

test("normalizes revoked Tool-call and argument Proxies as INVALID_TOOL_CALL", async () => {
  const revokedCall = Proxy.revocable({}, {});
  revokedCall.revoke();
  await expect(
    executeToolCall(
      new ToolRegistry(),
      revokedCall.proxy as CourseToolCall,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    name: "ToolContractError",
    code: "INVALID_TOOL_CALL",
  });

  const revokedArguments = Proxy.revocable({}, {});
  revokedArguments.revoke();
  await expect(
    executeToolCall(
      new ToolRegistry(),
      {
        type: "toolCall",
        id: "call-revoked-arguments",
        name: "missing",
        arguments: revokedArguments.proxy,
      } as CourseToolCall,
      new AbortController().signal,
    ),
  ).rejects.toMatchObject({
    name: "ToolContractError",
    code: "INVALID_TOOL_CALL",
  });
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

test("external throws cannot forge internal ToolContractError provenance", async () => {
  const forged = new ToolContractError(
    "DUPLICATE_TOOL_NAME",
    "external code chose this label",
  );
  const definition = {
    get name(): string {
      throw forged;
    },
    description: "Must normalize the boundary.",
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input: unknown) => input,
  };
  expect(() => defineTool(definition)).toThrowError(
    expect.objectContaining({
      name: "ToolContractError",
      code: "INVALID_TOOL_DEFINITION",
    }),
  );

  const registry = new ToolRegistry([
    defineTool({
      name: "forged-execution-error",
      description: "Normalize external contract-looking errors.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => {
        throw forged;
      },
    }),
  ]);
  await expect(
    executeToolCall(
      registry,
      call("forged-execution-error"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content: expect.stringContaining("TOOL_EXECUTION_FAILED"),
  });
});

test("freezes internal ToolContractErrors and reclassifies replay at its new boundary", () => {
  const registry = new ToolRegistry([echoTool("captured")]);
  let captured: unknown;
  try {
    registry.register(echoTool("captured"));
  } catch (error) {
    captured = error;
  }
  expect(captured).toBeInstanceOf(ToolContractError);
  expect(captured).toMatchObject({ code: "DUPLICATE_TOOL_NAME" });
  expect(Object.isFrozen(captured)).toBe(true);
  expect(Reflect.set(captured as object, "code", "INVALID_TOOL_CALL")).toBe(
    false,
  );
  expect(Reflect.set(captured as object, "message", "mutated")).toBe(false);

  const replayingDefinition = {
    get name(): string {
      throw captured;
    },
    description: "Replay an authentic prior boundary error.",
    validate: (input: unknown) => ({ ok: true as const, value: input }),
    execute: async (input: unknown) => input,
  };
  let replayed: unknown;
  try {
    defineTool(replayingDefinition);
  } catch (error) {
    replayed = error;
  }
  expect(replayed).not.toBe(captured);
  expect(replayed).toMatchObject({
    name: "ToolContractError",
    code: "INVALID_TOOL_DEFINITION",
  });
  expect(Object.isFrozen(replayed)).toBe(true);
});

test("a forged NonRecoverableToolError prototype stays recoverable", async () => {
  const forged = Object.assign(
    Object.create(NonRecoverableToolError.prototype) as Record<string, unknown>,
    {
      name: "NonRecoverableToolError",
      code: "NON_RECOVERABLE_TOOL_ERROR",
      nonRecoverable: true,
      message: "prototype-only forgery",
    },
  );
  const registry = new ToolRegistry([
    defineTool({
      name: "forged-programmer-error",
      description: "Reject prototype-only markers.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => {
        throw forged;
      },
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("forged-programmer-error"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: true,
    content: expect.stringContaining("TOOL_EXECUTION_FAILED"),
  });
});

test("shares NonRecoverableToolError provenance across module reloads and subclasses", async () => {
  vi.resetModules();
  const copyA = await import("../src/tool");
  class ReloadedInvariantError extends copyA.NonRecoverableToolError {}
  const direct = new copyA.NonRecoverableToolError("copy A direct error");
  const subclassed = new ReloadedInvariantError("copy A subclass error");

  vi.resetModules();
  const copyB = await import("../src/tool");
  for (const [index, failure] of [direct, subclassed].entries()) {
    const registry = new copyB.ToolRegistry([
      copyB.defineTool({
        name: `cross-module-programmer-error-${index}`,
        description: "Propagate a constructor-authorized error.",
        validate: (input) => ({ ok: true, value: input }),
        execute: async () => {
          throw failure;
        },
      }),
    ]);

    await expect(
      copyB.executeToolCall(
        registry,
        call(`cross-module-programmer-error-${index}`),
        new AbortController().signal,
      ),
    ).rejects.toBe(failure);
  }
});

test("accepts nested cross-realm plain JSON outputs", async () => {
  const crossRealmOutput = runInNewContext(`({
    z: 3,
    nested: { ok: true },
    list: [1, { value: "cross-realm" }]
  })`);
  const registry = new ToolRegistry([
    defineTool({
      name: "cross-realm-output",
      description: "Accept structural JSON containers from another realm.",
      validate: (input) => ({ ok: true, value: input }),
      execute: async () => crossRealmOutput,
    }),
  ]);

  await expect(
    executeToolCall(
      registry,
      call("cross-realm-output"),
      new AbortController().signal,
    ),
  ).resolves.toMatchObject({
    isError: false,
    content: '{"list":[1,{"value":"cross-realm"}],"nested":{"ok":true},"z":3}',
  });
});
