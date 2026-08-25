type StreamState =
  | Readonly<{ status: "open" }>
  | Readonly<{ status: "finished" }>
  | Readonly<{ status: "failed"; error: unknown }>;

type IteratorWaiter<Event> = Readonly<{
  resolve: (result: IteratorResult<Event>) => void;
  reject: (reason?: unknown) => void;
}>;

type ActiveIterator<Event> = {
  closed: boolean;
  readonly waiters: IteratorWaiter<Event>[];
};

const DONE: IteratorResult<never> = Object.freeze({
  done: true,
  value: undefined,
});

/**
 * A course-owned, single-consumer async event queue with a separate result.
 *
 * Only one iterator may be active at a time. Calling `return()` releases that
 * iterator, after which a sequential consumer may continue with events that
 * were not consumed. Events buffered before a terminal state remain ordered;
 * iteration ends after `finish()` or rejects after `fail()` once they drain.
 */
export class EventStream<Event, Result> implements AsyncIterable<Event> {
  public readonly result: Promise<Result>;

  private readonly buffer: Event[] = [];
  private readonly resolveResult: (result: Result) => void;
  private readonly rejectResult: (reason?: unknown) => void;
  private state: StreamState = { status: "open" };
  private activeIterator: ActiveIterator<Event> | undefined;

  public constructor() {
    let resolveResult!: (result: Result) => void;
    let rejectResult!: (reason?: unknown) => void;
    this.result = new Promise<Result>((resolve, reject) => {
      resolveResult = resolve;
      rejectResult = reject;
    });
    this.resolveResult = resolveResult;
    this.rejectResult = rejectResult;

    // Iteration and result consumption are independent. Registering a handler
    // prevents an ignored result from becoming an unhandled rejection while
    // preserving the original promise's rejected state for callers.
    void this.result.catch(() => undefined);
  }

  public push(event: Event): void {
    this.assertOpen();

    const waiter = this.activeIterator?.waiters.shift();
    if (waiter !== undefined) {
      waiter.resolve({ done: false, value: event });
      return;
    }

    this.buffer.push(event);
  }

  public finish(result: Result): void {
    this.assertOpen();
    this.state = { status: "finished" };
    this.resolveResult(result);

    if (this.buffer.length === 0 && this.activeIterator !== undefined) {
      this.closeIterator(this.activeIterator, { type: "done" });
    }
  }

  public fail(error: unknown): void {
    this.assertOpen();
    this.state = { status: "failed", error };
    this.rejectResult(error);

    const iterator = this.activeIterator;
    if (
      this.buffer.length === 0 &&
      iterator !== undefined &&
      iterator.waiters.length > 0
    ) {
      this.closeIterator(iterator, { type: "failed", error });
    }
  }

  public [Symbol.asyncIterator](): AsyncIterableIterator<Event> {
    if (this.activeIterator !== undefined) {
      throw new Error("EventStream supports a single consumer at a time");
    }

    const state: ActiveIterator<Event> = { closed: false, waiters: [] };
    this.activeIterator = state;

    const iterator: AsyncIterableIterator<Event> = {
      next: () => this.next(state),
      return: () => this.return(state),
      [Symbol.asyncIterator]: () => iterator,
    };
    return iterator;
  }

  private next(
    iterator: ActiveIterator<Event>,
  ): Promise<IteratorResult<Event>> {
    if (iterator.closed) {
      return Promise.resolve(DONE);
    }

    if (this.buffer.length > 0) {
      const event = this.buffer.shift() as Event;
      return Promise.resolve({ done: false, value: event });
    }

    if (this.state.status === "finished") {
      this.closeIterator(iterator, { type: "done" });
      return Promise.resolve(DONE);
    }

    if (this.state.status === "failed") {
      const { error } = this.state;
      this.closeIterator(iterator, { type: "failed", error });
      return Promise.reject(error);
    }

    return new Promise<IteratorResult<Event>>((resolve, reject) => {
      iterator.waiters.push({ resolve, reject });
    });
  }

  private return(
    iterator: ActiveIterator<Event>,
  ): Promise<IteratorResult<Event>> {
    if (!iterator.closed) {
      this.closeIterator(iterator, { type: "done" });
    }
    return Promise.resolve(DONE);
  }

  private closeIterator(
    iterator: ActiveIterator<Event>,
    terminal:
      Readonly<{ type: "done" }> | Readonly<{ type: "failed"; error: unknown }>,
  ): void {
    iterator.closed = true;
    if (this.activeIterator === iterator) {
      this.activeIterator = undefined;
    }

    const waiters = iterator.waiters.splice(0);
    for (const waiter of waiters) {
      if (terminal.type === "done") {
        waiter.resolve(DONE);
      } else {
        waiter.reject(terminal.error);
      }
    }
  }

  private assertOpen(): void {
    if (this.state.status !== "open") {
      throw new Error(`EventStream is already terminal (${this.state.status})`);
    }
  }
}
