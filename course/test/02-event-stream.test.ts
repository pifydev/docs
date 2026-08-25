import { expect, test } from "vitest";

import { EventStream } from "../src/index";

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

async function collect<Value>(source: AsyncIterable<Value>): Promise<Value[]> {
  const values: Value[] = [];
  for await (const value of source) {
    values.push(value);
  }
  return values;
}

test("delivers buffered events in push order before the terminal result", async () => {
  const stream = new EventStream<string, number>();

  stream.push("first");
  stream.push("second");
  stream.finish(42);

  await expect(collect(stream)).resolves.toEqual(["first", "second"]);
  await expect(stream.result).resolves.toBe(42);
});

test("settles a waiter that registered before push without a timer", async () => {
  const stream = new EventStream<string, string>();
  const iterator = stream[Symbol.asyncIterator]();
  const waiterRegistered = deferred<void>();

  const nextEvent = (async () => {
    const pending = iterator.next();
    waiterRegistered.resolve();
    return pending;
  })();

  await waiterRegistered.promise;
  stream.push("after-wait");

  await expect(nextEvent).resolves.toEqual({
    done: false,
    value: "after-wait",
  });
  stream.finish("complete");
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(stream.result).resolves.toBe("complete");
});

test("accepts exactly one terminal finish and preserves its result", async () => {
  const stream = new EventStream<string, string>();

  stream.finish("first-result");

  expect(() => stream.finish("second-result")).toThrow(/already terminal/i);
  expect(() => stream.fail(new Error("late failure"))).toThrow(
    /already terminal/i,
  );
  await expect(stream.result).resolves.toBe("first-result");
});

test("fail rejects the result and every pending iterator waiter", async () => {
  const stream = new EventStream<string, string>();
  const iterator = stream[Symbol.asyncIterator]();
  const first = iterator.next();
  const second = iterator.next();
  const failure = new Error("model transport failed");

  const resultRejection = expect(stream.result).rejects.toBe(failure);
  stream.fail(failure);

  await expect(first).rejects.toBe(failure);
  await expect(second).rejects.toBe(failure);
  await resultRejection;
  await expect(iterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
});

test("delivers events buffered before failure and then rejects iteration", async () => {
  const stream = new EventStream<string, string>();
  const failure = new Error("stream failed");

  stream.push("before-failure");
  const resultRejection = expect(stream.result).rejects.toBe(failure);
  stream.fail(failure);

  const iterator = stream[Symbol.asyncIterator]();
  await expect(iterator.next()).resolves.toEqual({
    done: false,
    value: "before-failure",
  });
  await expect(iterator.next()).rejects.toBe(failure);
  await resultRejection;
});

test("settles every pending waiter when the stream finishes", async () => {
  const stream = new EventStream<string, string>();
  const iterator = stream[Symbol.asyncIterator]();
  const pending = [iterator.next(), iterator.next(), iterator.next()];

  stream.finish("done");

  await expect(Promise.all(pending)).resolves.toEqual([
    { done: true, value: undefined },
    { done: true, value: undefined },
    { done: true, value: undefined },
  ]);
  await expect(stream.result).resolves.toBe("done");
});

test("delivers FIFO events to pending waiters and closes the surplus waiter", async () => {
  const stream = new EventStream<string, string>();
  const iterator = stream[Symbol.asyncIterator]();
  const first = iterator.next();
  const second = iterator.next();
  const surplus = iterator.next();

  stream.push("first");
  stream.push("second");
  stream.finish("complete");

  await expect(first).resolves.toEqual({ done: false, value: "first" });
  await expect(second).resolves.toEqual({ done: false, value: "second" });
  await expect(surplus).resolves.toEqual({ done: true, value: undefined });
  await expect(stream.result).resolves.toBe("complete");
});

test("consumer return settles pending reads and releases the iterator", async () => {
  const stream = new EventStream<string, string>();
  const firstIterator = stream[Symbol.asyncIterator]();
  const first = firstIterator.next();
  const second = firstIterator.next();

  await expect(firstIterator.return?.()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(first).resolves.toEqual({ done: true, value: undefined });
  await expect(second).resolves.toEqual({ done: true, value: undefined });

  const replacementIterator = stream[Symbol.asyncIterator]();
  stream.push("replacement-consumer");
  await expect(replacementIterator.next()).resolves.toEqual({
    done: false,
    value: "replacement-consumer",
  });

  stream.finish("done");
  await expect(replacementIterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(stream.result).resolves.toBe("done");
});

test("rejects concurrent iterators but permits a later sequential iterator", async () => {
  const stream = new EventStream<string, string>();
  const firstIterator = stream[Symbol.asyncIterator]();

  expect(() => stream[Symbol.asyncIterator]()).toThrow(/single consumer/i);

  await firstIterator.return?.();
  const secondIterator = stream[Symbol.asyncIterator]();
  stream.finish("done");
  await expect(secondIterator.next()).resolves.toEqual({
    done: true,
    value: undefined,
  });
  await expect(stream.result).resolves.toBe("done");
});

test("rejects pushes after either terminal state", async () => {
  const finished = new EventStream<string, string>();
  finished.finish("done");
  expect(() => finished.push("late")).toThrow(/already terminal/i);
  await expect(finished.result).resolves.toBe("done");

  const failed = new EventStream<string, string>();
  const failure = new Error("failed");
  const resultRejection = expect(failed.result).rejects.toBe(failure);
  failed.fail(failure);
  expect(() => failed.push("late")).toThrow(/already terminal/i);
  await resultRejection;
});
