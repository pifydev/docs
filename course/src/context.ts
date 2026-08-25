import {
  assistantMessage,
  toolResultMessage,
  userMessage,
  validateTranscript,
} from "./messages";
import type {
  CourseAssistantBlock,
  CourseJsonObject,
  CourseJsonValue,
  CourseMessage,
} from "./protocol";

const reflectApply = Reflect.apply;
const nativeCharCodeAt = String.prototype.charCodeAt;
const NativePromise = Promise;
const nativePromiseResolve = Promise.resolve;
const nativePromiseRace = Promise.race;
const nativePromiseThen = Promise.prototype.then;
const abortSignalAbortedGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "aborted",
)?.get;
const abortSignalReasonGetter = Object.getOwnPropertyDescriptor(
  AbortSignal.prototype,
  "reason",
)?.get;
const addAbortListener = AbortSignal.prototype.addEventListener;
const removeAbortListener = AbortSignal.prototype.removeEventListener;

/** Hard limits keep validation and budgeting bounded for hostile input. */
export const MAX_CONTEXT_MESSAGES = 4_096;
export const MAX_CONTEXT_REQUIREMENTS = 128;
export const MAX_CONTEXT_RECORDS = 256;
export const MAX_CONTEXT_DEPTH = 32;
export const MAX_CONTEXT_COLLECTION_ITEMS = 16_384;
export const MAX_CONTEXT_STRING_UNITS = 65_536;
export const MAX_CONTEXT_TOTAL_UNITS = 1_000_000;

export type ContextRequirement = Readonly<{
  id: string;
  content: string;
}>;

export type ContextSummary = Readonly<{
  id: string;
  content: string;
}>;

export type ContextCompactionRecord = Readonly<{
  id: string;
  summaryId: string;
  boundary: number;
  compactedMessageIds: readonly string[];
  unitsBefore: number;
  unitsAfter: number;
}>;

export type ActiveContext = Readonly<{
  requirements: readonly ContextRequirement[];
  summary: ContextSummary | null;
  messages: readonly CourseMessage[];
  compactions: readonly ContextCompactionRecord[];
}>;

export type ActiveContextInput = Readonly<{
  requirements?: readonly ContextRequirement[];
  summary?: ContextSummary | null;
  messages?: readonly CourseMessage[];
  compactions?: readonly ContextCompactionRecord[];
}>;

export type ContextToolGroup = Readonly<{
  kind: "message" | "toolRound";
  startIndex: number;
  /** Exclusive transcript index. */
  endIndex: number;
  messages: readonly CourseMessage[];
}>;

export type ContextBoundaryOptions = Readonly<{
  targetUnits: number;
  summaryMaxUnits: number;
  retainRecentMessages: number;
}>;

export type ContextSummaryRequest = Readonly<{
  requirements: readonly ContextRequirement[];
  previousSummary: ContextSummary | null;
  messages: readonly CourseMessage[];
  boundary: number;
  maxSummaryUnits: number;
}>;

export type ContextSummarizer = (
  request: ContextSummaryRequest,
  signal: AbortSignal,
) => string | PromiseLike<string>;

export type CompactContextOptions = ContextBoundaryOptions &
  Readonly<{
    maxUnits: number;
    summaryId: string;
    recordId: string;
    summarizer: ContextSummarizer;
    signal?: AbortSignal;
  }>;

export type ContextCompactionResult =
  | Readonly<{
      status: "unchanged";
      context: ActiveContext;
      record: null;
    }>
  | Readonly<{
      status: "compacted";
      context: ActiveContext;
      record: ContextCompactionRecord;
    }>;

export type ContextCompactionErrorCode =
  | "CONTEXT_INVALID_INPUT"
  | "CONTEXT_INVALID_TRANSCRIPT"
  | "CONTEXT_LIMIT_EXCEEDED"
  | "CONTEXT_INVALID_BUDGET"
  | "CONTEXT_BOUNDARY_UNAVAILABLE"
  | "CONTEXT_SUMMARY_INVALID"
  | "CONTEXT_SUMMARY_INSUFFICIENT"
  | "CONTEXT_SUMMARIZER_FAILED"
  | "CONTEXT_CANCELLED";

/** Stable public error surface for every fail-closed Context operation. */
export class ContextCompactionError extends Error {
  public constructor(
    public readonly code: ContextCompactionErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ContextCompactionError";
    Object.freeze(this);
  }
}

type SnapshotBudget = {
  collectionItems: number;
  stringUnits: number;
};

type SnapshotBoundaryOptions = Readonly<{
  targetUnits: number;
  summaryMaxUnits: number;
  retainRecentMessages: number;
}>;

type SnapshotCompactOptions = SnapshotBoundaryOptions &
  Readonly<{
    maxUnits: number;
    summaryId: string;
    recordId: string;
    summarizer: ContextSummarizer;
    signal: AbortSignal;
  }>;

const activeContexts = new WeakSet<object>();

/**
 * Build a validated, deeply immutable context. Requirements and summaries are
 * explicit course-only channels; they do not add a fake role to CourseMessage.
 */
export function buildActiveContext(input: ActiveContextInput): ActiveContext {
  if (activeContexts.has(input as object)) return input as ActiveContext;
  try {
    const record = assertPlainRecord(input, "Context");
    const budget: SnapshotBudget = { collectionItems: 0, stringUnits: 0 };
    const requirementsValue = optionalOwnData(record, "requirements", []);
    const summaryValue = optionalOwnData(record, "summary", null);
    const messagesValue = optionalOwnData(record, "messages", []);
    const compactionsValue = optionalOwnData(record, "compactions", []);

    const requirements = snapshotRequirements(requirementsValue, budget);
    const summary = snapshotSummary(summaryValue, budget);
    const messages = snapshotTranscript(messagesValue, budget);
    const compactions = snapshotCompactionRecords(compactionsValue, budget);
    const context: ActiveContext = Object.freeze({
      requirements,
      summary,
      messages,
      compactions,
    });
    const units = estimateOwnedContextUnits(context);
    if (units > MAX_CONTEXT_TOTAL_UNITS) {
      fail(
        "CONTEXT_LIMIT_EXCEEDED",
        `Context must not exceed ${MAX_CONTEXT_TOTAL_UNITS} units`,
      );
    }
    activeContexts.add(context);
    return context;
  } catch (error) {
    if (error instanceof ContextCompactionError) throw error;
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      "Context could not be inspected safely",
      { cause: error },
    );
  }
}

/** Return immutable contiguous groups whose boundaries never split Tool work. */
export function groupToolRounds(
  transcript: unknown,
): readonly ContextToolGroup[] {
  const messages = snapshotTranscript(transcript, {
    collectionItems: 0,
    stringUnits: 0,
  });
  return groupOwnedToolRounds(messages);
}

/**
 * Count deterministic course units. Strings count Unicode code points (not
 * UTF-16 code units); fixed structural weights are documented in the code.
 */
export function estimateContextUnits(input: ActiveContextInput): number {
  return estimateOwnedContextUnits(buildActiveContext(input));
}

/** Select the earliest safe prefix boundary that satisfies the target. */
export function selectCompactionBoundary(
  input: ActiveContextInput,
  options: ContextBoundaryOptions,
): number | null {
  const context = buildActiveContext(input);
  const selected = snapshotBoundaryOptions(options);
  return selectOwnedBoundary(context, selected);
}

/**
 * Compact without mutating the previous context. The record is appended only
 * after the summary and the complete prospective context both validate.
 */
export async function compactContext(
  input: ActiveContextInput,
  options: CompactContextOptions,
): Promise<ContextCompactionResult> {
  const context = buildActiveContext(input);
  const selected = snapshotCompactOptions(options);
  const unitsBefore = estimateOwnedContextUnits(context);
  if (unitsBefore <= selected.maxUnits) {
    return Object.freeze({ status: "unchanged", context, record: null });
  }

  throwIfCancelled(selected.signal);
  if (context.compactions.some(({ id }) => id === selected.recordId)) {
    fail(
      "CONTEXT_INVALID_INPUT",
      `Context compaction ID "${selected.recordId}" is already present`,
    );
  }
  const boundary = selectOwnedBoundary(context, selected);
  if (boundary === null || boundary <= 0) {
    fail(
      "CONTEXT_BOUNDARY_UNAVAILABLE",
      "No complete Tool-round boundary can satisfy the Context budget",
    );
  }

  const compactedMessages = Object.freeze(context.messages.slice(0, boundary));
  const request: ContextSummaryRequest = Object.freeze({
    requirements: context.requirements,
    previousSummary: context.summary,
    messages: compactedMessages,
    boundary,
    maxSummaryUnits: selected.summaryMaxUnits,
  });

  let returned: unknown;
  try {
    returned = reflectApply(selected.summarizer, undefined, [
      request,
      selected.signal,
    ]);
  } catch (error) {
    throw new ContextCompactionError(
      "CONTEXT_SUMMARIZER_FAILED",
      "Context summarizer threw before producing a summary",
      { cause: error },
    );
  }

  const summaryContent = await awaitSummary(returned, selected.signal);
  throwIfCancelled(selected.signal);
  if (typeof summaryContent !== "string") {
    fail(
      "CONTEXT_SUMMARY_INVALID",
      "Context summarizer must return plain text",
    );
  }
  assertBoundedString(
    summaryContent,
    "Context summary content",
    "CONTEXT_SUMMARY_INVALID",
  );
  if (summaryContent.trim().length === 0) {
    fail(
      "CONTEXT_SUMMARY_INSUFFICIENT",
      "Context summary must contain non-whitespace text",
    );
  }

  const summary = Object.freeze({
    id: selected.summaryId,
    content: summaryContent,
  });
  const summaryUnits = estimateSummaryUnits(summary);
  if (summaryUnits > selected.summaryMaxUnits) {
    fail(
      "CONTEXT_SUMMARY_INSUFFICIENT",
      `Context summary exceeds its ${selected.summaryMaxUnits}-unit budget`,
    );
  }

  const retainedMessages = Object.freeze(context.messages.slice(boundary));
  // A safe boundary must independently leave a valid transcript suffix.
  assertTranscriptValid(retainedMessages);
  const compactedMessageIds = Object.freeze(
    compactedMessages.map((message) => message.id),
  );
  const prospectiveWithoutRecord = buildActiveContext({
    requirements: context.requirements,
    summary,
    messages: retainedMessages,
    compactions: context.compactions,
  });
  const unitsAfter = estimateOwnedContextUnits(prospectiveWithoutRecord);
  if (unitsAfter > selected.targetUnits) {
    fail(
      "CONTEXT_SUMMARY_INSUFFICIENT",
      "Validated summary does not reduce Context to the target budget",
    );
  }

  const record: ContextCompactionRecord = Object.freeze({
    id: selected.recordId,
    summaryId: selected.summaryId,
    boundary,
    compactedMessageIds,
    unitsBefore,
    unitsAfter,
  });
  const prospective = buildActiveContext({
    requirements: context.requirements,
    summary,
    messages: retainedMessages,
    compactions: [...context.compactions, record],
  });
  // Revalidate after the final record exists, before exposing either value.
  assertTranscriptValid(prospective.messages);
  throwIfCancelled(selected.signal);
  const storedRecord =
    prospective.compactions[prospective.compactions.length - 1];
  return Object.freeze({
    status: "compacted",
    context: prospective,
    record: storedRecord,
  });
}

function groupOwnedToolRounds(
  messages: readonly CourseMessage[],
): readonly ContextToolGroup[] {
  const resultIndexByCall = new Map<string, number>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role === "toolResult") {
      resultIndexByCall.set(message.toolCallId, index);
    }
  }

  const intervalEndByStart = new Map<number, number>();
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message.role !== "assistant") continue;
    let endIndex = index + 1;
    let hasToolCall = false;
    for (
      let blockIndex = 0;
      blockIndex < message.content.length;
      blockIndex += 1
    ) {
      const block = message.content[blockIndex];
      if (block.type !== "toolCall") continue;
      hasToolCall = true;
      const resultIndex = resultIndexByCall.get(block.id);
      if (resultIndex === undefined) {
        fail(
          "CONTEXT_INVALID_TRANSCRIPT",
          `Tool call "${block.id}" has no result`,
        );
      }
      endIndex = Math.max(endIndex, resultIndex + 1);
    }
    if (hasToolCall) intervalEndByStart.set(index, endIndex);
  }

  const groups: ContextToolGroup[] = [];
  let index = 0;
  while (index < messages.length) {
    const directEnd = intervalEndByStart.get(index);
    if (directEnd === undefined) {
      groups.push(
        Object.freeze({
          kind: "message",
          startIndex: index,
          endIndex: index + 1,
          messages: Object.freeze([messages[index]]),
        }),
      );
      index += 1;
      continue;
    }

    let endIndex = directEnd;
    for (
      let nestedIndex = index + 1;
      nestedIndex < endIndex;
      nestedIndex += 1
    ) {
      const nestedEnd = intervalEndByStart.get(nestedIndex);
      if (nestedEnd !== undefined && nestedEnd > endIndex) endIndex = nestedEnd;
    }
    groups.push(
      Object.freeze({
        kind: "toolRound",
        startIndex: index,
        endIndex,
        messages: Object.freeze(messages.slice(index, endIndex)),
      }),
    );
    index = endIndex;
  }
  return Object.freeze(groups);
}

function selectOwnedBoundary(
  context: ActiveContext,
  options: SnapshotBoundaryOptions,
): number | null {
  const groups = groupOwnedToolRounds(context.messages);
  const latestBoundary = context.messages.length - options.retainRecentMessages;
  if (latestBoundary <= 0) return null;

  const fixedUnits =
    estimateRequirementsUnits(context.requirements) + options.summaryMaxUnits;
  const messageUnits = context.messages.map(estimateMessageUnits);
  let retainedUnits = 0;
  for (let index = 0; index < messageUnits.length; index += 1) {
    retainedUnits += messageUnits[index];
  }

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    for (
      let messageIndex = group.startIndex;
      messageIndex < group.endIndex;
      messageIndex += 1
    ) {
      retainedUnits -= messageUnits[messageIndex];
    }
    if (group.endIndex > latestBoundary) return null;
    if (fixedUnits + retainedUnits <= options.targetUnits) {
      return group.endIndex;
    }
  }
  return null;
}

function estimateOwnedContextUnits(context: ActiveContext): number {
  let units = estimateRequirementsUnits(context.requirements);
  if (context.summary !== null) units += estimateSummaryUnits(context.summary);
  for (let index = 0; index < context.messages.length; index += 1) {
    units += estimateMessageUnits(context.messages[index]);
  }
  return units;
}

function estimateRequirementsUnits(
  requirements: readonly ContextRequirement[],
): number {
  let units = 0;
  for (let index = 0; index < requirements.length; index += 1) {
    const requirement = requirements[index];
    units +=
      3 + unicodeUnits(requirement.id) + unicodeUnits(requirement.content);
  }
  return units;
}

function estimateSummaryUnits(summary: ContextSummary): number {
  return 5 + unicodeUnits(summary.id) + unicodeUnits(summary.content);
}

function estimateMessageUnits(message: CourseMessage): number {
  if (message.role === "user") {
    return 4 + unicodeUnits(message.id) + unicodeUnits(message.content);
  }
  if (message.role === "assistant") {
    let units = 4 + unicodeUnits(message.id);
    for (let index = 0; index < message.content.length; index += 1) {
      const block = message.content[index];
      if (block.type === "text") units += 2 + unicodeUnits(block.text);
      else {
        units +=
          6 +
          unicodeUnits(block.id) +
          unicodeUnits(block.name) +
          estimateJsonUnits(block.arguments);
      }
    }
    return units;
  }
  return (
    6 +
    unicodeUnits(message.id) +
    unicodeUnits(message.toolCallId) +
    unicodeUnits(message.toolName) +
    unicodeUnits(message.content) +
    1
  );
}

function estimateJsonUnits(value: CourseJsonValue): number {
  if (value === null) return 1;
  if (typeof value === "string") return 1 + unicodeUnits(value);
  if (typeof value === "number") return 1 + String(value).length;
  if (typeof value === "boolean") return value ? 5 : 6;
  if (Array.isArray(value)) {
    let units = 2;
    for (let index = 0; index < value.length; index += 1) {
      units += 1 + estimateJsonUnits(value[index]);
    }
    return units;
  }
  let units = 2;
  const objectValue = value as CourseJsonObject;
  const keys = Object.keys(objectValue).sort();
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    units += 1 + unicodeUnits(key) + estimateJsonUnits(objectValue[key]);
  }
  return units;
}

function unicodeUnits(value: string): number {
  let units = 0;
  let index = 0;
  while (index < value.length) {
    const first = reflectApply(nativeCharCodeAt, value, [index]) as number;
    if (first >= 0xd800 && first <= 0xdbff && index + 1 < value.length) {
      const second = reflectApply(nativeCharCodeAt, value, [
        index + 1,
      ]) as number;
      if (second >= 0xdc00 && second <= 0xdfff) index += 1;
    }
    index += 1;
    units += 1;
  }
  return units;
}

function snapshotRequirements(
  value: unknown,
  budget: SnapshotBudget,
): readonly ContextRequirement[] {
  const entries = snapshotArray(
    value,
    "Context requirements",
    MAX_CONTEXT_REQUIREMENTS,
  );
  addCollectionItems(budget, entries.length);
  const ids = new Set<string>();
  const requirements: ContextRequirement[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const record = assertPlainRecord(
      entries[index],
      `Context requirements[${index}]`,
    );
    const id = requiredString(
      record,
      "id",
      `Context requirements[${index}].id`,
      false,
      budget,
    );
    const content = requiredString(
      record,
      "content",
      `Context requirements[${index}].content`,
      false,
      budget,
    );
    if (ids.has(id)) {
      fail(
        "CONTEXT_INVALID_INPUT",
        `Context requirement ID "${id}" is duplicated`,
      );
    }
    ids.add(id);
    requirements.push(Object.freeze({ id, content }));
  }
  return Object.freeze(requirements);
}

function snapshotSummary(
  value: unknown,
  budget: SnapshotBudget,
): ContextSummary | null {
  if (value === null || value === undefined) return null;
  const record = assertPlainRecord(value, "Context summary");
  const id = requiredString(record, "id", "Context summary.id", false, budget);
  const content = requiredString(
    record,
    "content",
    "Context summary.content",
    true,
    budget,
  );
  if (content.trim().length === 0) {
    fail(
      "CONTEXT_SUMMARY_INVALID",
      "Context summary content must not be empty",
    );
  }
  return Object.freeze({ id, content });
}

function snapshotCompactionRecords(
  value: unknown,
  budget: SnapshotBudget,
): readonly ContextCompactionRecord[] {
  const entries = snapshotArray(
    value,
    "Context compactions",
    MAX_CONTEXT_RECORDS,
  );
  addCollectionItems(budget, entries.length);
  const ids = new Set<string>();
  const records: ContextCompactionRecord[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const path = `Context compactions[${index}]`;
    const record = assertPlainRecord(entries[index], path);
    const id = requiredString(record, "id", `${path}.id`, false, budget);
    const summaryId = requiredString(
      record,
      "summaryId",
      `${path}.summaryId`,
      false,
      budget,
    );
    const boundary = requiredSafeInteger(
      record,
      "boundary",
      `${path}.boundary`,
      1,
    );
    const unitsBefore = requiredSafeInteger(
      record,
      "unitsBefore",
      `${path}.unitsBefore`,
      0,
    );
    const unitsAfter = requiredSafeInteger(
      record,
      "unitsAfter",
      `${path}.unitsAfter`,
      0,
    );
    const messageIdValues = snapshotArray(
      requiredOwnData(
        record,
        "compactedMessageIds",
        `${path}.compactedMessageIds`,
      ),
      `${path}.compactedMessageIds`,
      MAX_CONTEXT_MESSAGES,
    );
    addCollectionItems(budget, messageIdValues.length);
    if (messageIdValues.length === 0 || messageIdValues.length !== boundary) {
      fail(
        "CONTEXT_INVALID_INPUT",
        `${path}.compactedMessageIds must match its positive boundary`,
      );
    }
    const compactedMessageIds: string[] = [];
    for (
      let messageIndex = 0;
      messageIndex < messageIdValues.length;
      messageIndex += 1
    ) {
      const messageId = messageIdValues[messageIndex];
      assertBoundedString(
        messageId,
        `${path}.compactedMessageIds[${messageIndex}]`,
        "CONTEXT_INVALID_INPUT",
        budget,
      );
      if (messageId.trim().length === 0) {
        fail("CONTEXT_INVALID_INPUT", `${path} contains an empty message ID`);
      }
      compactedMessageIds.push(messageId);
    }
    if (ids.has(id)) {
      fail(
        "CONTEXT_INVALID_INPUT",
        `Context compaction ID "${id}" is duplicated`,
      );
    }
    ids.add(id);
    records.push(
      Object.freeze({
        id,
        summaryId,
        boundary,
        compactedMessageIds: Object.freeze(compactedMessageIds),
        unitsBefore,
        unitsAfter,
      }),
    );
  }
  return Object.freeze(records);
}

function snapshotTranscript(
  value: unknown,
  budget: SnapshotBudget,
): readonly CourseMessage[] {
  try {
    const entries = snapshotArray(
      value,
      "Context messages",
      MAX_CONTEXT_MESSAGES,
    );
    addCollectionItems(budget, entries.length);
    const messages: CourseMessage[] = [];
    for (let index = 0; index < entries.length; index += 1) {
      messages.push(snapshotMessage(entries[index], index, budget));
    }
    const frozen = Object.freeze(messages);
    assertTranscriptValid(frozen);
    return frozen;
  } catch (error) {
    if (
      error instanceof ContextCompactionError &&
      error.code === "CONTEXT_LIMIT_EXCEEDED"
    ) {
      throw error;
    }
    if (
      error instanceof ContextCompactionError &&
      error.code === "CONTEXT_INVALID_TRANSCRIPT"
    ) {
      throw error;
    }
    throw new ContextCompactionError(
      "CONTEXT_INVALID_TRANSCRIPT",
      "Context messages are not a safe valid transcript",
      { cause: error },
    );
  }
}

function snapshotMessage(
  value: unknown,
  index: number,
  budget: SnapshotBudget,
): CourseMessage {
  const path = `Context messages[${index}]`;
  const record = assertPlainRecord(value, path);
  const role = requiredOwnData(record, "role", `${path}.role`);
  const id = requiredString(record, "id", `${path}.id`, false, budget);
  if (role === "user") {
    const content = requiredString(
      record,
      "content",
      `${path}.content`,
      true,
      budget,
    );
    return userMessage({ id, content });
  }
  if (role === "assistant") {
    const content = snapshotAssistantContent(
      requiredOwnData(record, "content", `${path}.content`),
      path,
      budget,
    );
    return assistantMessage({ id, content });
  }
  if (role === "toolResult") {
    const toolCallId = requiredString(
      record,
      "toolCallId",
      `${path}.toolCallId`,
      false,
      budget,
    );
    const toolName = requiredString(
      record,
      "toolName",
      `${path}.toolName`,
      false,
      budget,
    );
    const content = requiredString(
      record,
      "content",
      `${path}.content`,
      true,
      budget,
    );
    const isError = requiredOwnData(record, "isError", `${path}.isError`);
    if (typeof isError !== "boolean") {
      fail("CONTEXT_INVALID_TRANSCRIPT", `${path}.isError must be a boolean`);
    }
    return toolResultMessage({ id, toolCallId, toolName, content, isError });
  }
  fail("CONTEXT_INVALID_TRANSCRIPT", `${path}.role is unsupported`);
}

function snapshotAssistantContent(
  value: unknown,
  path: string,
  budget: SnapshotBudget,
): readonly CourseAssistantBlock[] {
  const entries = snapshotArray(
    value,
    `${path}.content`,
    MAX_CONTEXT_COLLECTION_ITEMS,
  );
  addCollectionItems(budget, entries.length);
  const blocks: CourseAssistantBlock[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const blockPath = `${path}.content[${index}]`;
    const record = assertPlainRecord(entries[index], blockPath);
    const type = requiredOwnData(record, "type", `${blockPath}.type`);
    if (type === "text") {
      blocks.push(
        Object.freeze({
          type: "text",
          text: requiredString(
            record,
            "text",
            `${blockPath}.text`,
            true,
            budget,
          ),
        }),
      );
      continue;
    }
    if (type !== "toolCall") {
      fail("CONTEXT_INVALID_TRANSCRIPT", `${blockPath}.type is unsupported`);
    }
    blocks.push(
      Object.freeze({
        type: "toolCall",
        id: requiredString(record, "id", `${blockPath}.id`, false, budget),
        name: requiredString(
          record,
          "name",
          `${blockPath}.name`,
          false,
          budget,
        ),
        arguments: snapshotJsonObject(
          requiredOwnData(record, "arguments", `${blockPath}.arguments`),
          `${blockPath}.arguments`,
          0,
          new WeakSet(),
          budget,
        ),
      }),
    );
  }
  return Object.freeze(blocks);
}

function snapshotJsonObject(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>,
  budget: SnapshotBudget,
): CourseJsonObject {
  if (depth > MAX_CONTEXT_DEPTH) {
    fail("CONTEXT_LIMIT_EXCEEDED", `${path} exceeds maximum JSON depth`);
  }
  const record = assertPlainRecord(value, path);
  if (ancestors.has(record)) {
    fail("CONTEXT_INVALID_TRANSCRIPT", `${path} must not be circular`);
  }
  ancestors.add(record);
  try {
    const keys = Reflect.ownKeys(record);
    addCollectionItems(budget, keys.length);
    const snapshot: Record<string, CourseJsonValue> = Object.create(
      null,
    ) as Record<string, CourseJsonValue>;
    for (let index = 0; index < keys.length; index += 1) {
      const key = keys[index];
      if (typeof key !== "string") {
        fail(
          "CONTEXT_INVALID_TRANSCRIPT",
          `${path} must not contain symbol keys`,
        );
      }
      assertBoundedString(key, `${path} key`, "CONTEXT_INVALID_INPUT", budget);
      const descriptor = Object.getOwnPropertyDescriptor(record, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !("value" in descriptor)
      ) {
        fail(
          "CONTEXT_INVALID_TRANSCRIPT",
          `${path}.${key} must be enumerable data`,
        );
      }
      Object.defineProperty(snapshot, key, {
        configurable: false,
        enumerable: true,
        writable: false,
        value: snapshotJsonValue(
          descriptor.value,
          `${path}.${key}`,
          depth + 1,
          ancestors,
          budget,
        ),
      });
    }
    return Object.freeze(snapshot);
  } finally {
    ancestors.delete(record);
  }
}

function snapshotJsonValue(
  value: unknown,
  path: string,
  depth: number,
  ancestors: WeakSet<object>,
  budget: SnapshotBudget,
): CourseJsonValue {
  if (depth > MAX_CONTEXT_DEPTH) {
    fail("CONTEXT_LIMIT_EXCEEDED", `${path} exceeds maximum JSON depth`);
  }
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "string") {
    assertBoundedString(value, path, "CONTEXT_INVALID_INPUT", budget);
    return value;
  }
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      fail("CONTEXT_INVALID_TRANSCRIPT", `${path} must not be circular`);
    }
    ancestors.add(value);
    try {
      const entries = snapshotArray(value, path, MAX_CONTEXT_COLLECTION_ITEMS);
      addCollectionItems(budget, entries.length);
      const snapshot: CourseJsonValue[] = [];
      for (let index = 0; index < entries.length; index += 1) {
        snapshot.push(
          snapshotJsonValue(
            entries[index],
            `${path}[${index}]`,
            depth + 1,
            ancestors,
            budget,
          ),
        );
      }
      return Object.freeze(snapshot);
    } finally {
      ancestors.delete(value);
    }
  }
  return snapshotJsonObject(value, path, depth, ancestors, budget);
}

function snapshotBoundaryOptions(
  options: ContextBoundaryOptions,
): SnapshotBoundaryOptions {
  try {
    const record = assertPlainRecord(options, "Context boundary options");
    return snapshotBoundaryRecord(record);
  } catch (error) {
    if (error instanceof ContextCompactionError) throw error;
    throw new ContextCompactionError(
      "CONTEXT_INVALID_BUDGET",
      "Context boundary options are invalid",
      { cause: error },
    );
  }
}

function snapshotBoundaryRecord(
  record: Record<string, unknown>,
): SnapshotBoundaryOptions {
  const targetUnits = requiredBudgetInteger(
    record,
    "targetUnits",
    "targetUnits",
    1,
  );
  const summaryMaxUnits = requiredBudgetInteger(
    record,
    "summaryMaxUnits",
    "summaryMaxUnits",
    1,
  );
  const retainRecentMessages = requiredBudgetInteger(
    record,
    "retainRecentMessages",
    "retainRecentMessages",
    0,
  );
  if (targetUnits > MAX_CONTEXT_TOTAL_UNITS || summaryMaxUnits > targetUnits) {
    fail(
      "CONTEXT_INVALID_BUDGET",
      "Context target and summary budgets exceed supported bounds",
    );
  }
  if (retainRecentMessages > MAX_CONTEXT_MESSAGES) {
    fail(
      "CONTEXT_INVALID_BUDGET",
      `retainRecentMessages must not exceed ${MAX_CONTEXT_MESSAGES}`,
    );
  }
  return Object.freeze({ targetUnits, summaryMaxUnits, retainRecentMessages });
}

function snapshotCompactOptions(
  options: CompactContextOptions,
): SnapshotCompactOptions {
  try {
    const record = assertPlainRecord(options, "Context compaction options");
    const boundary = snapshotBoundaryRecord(record);
    const maxUnits = requiredBudgetInteger(record, "maxUnits", "maxUnits", 1);
    if (maxUnits > MAX_CONTEXT_TOTAL_UNITS || boundary.targetUnits > maxUnits) {
      fail(
        "CONTEXT_INVALID_BUDGET",
        "Context targetUnits must not exceed maxUnits",
      );
    }
    const summaryId = requiredString(record, "summaryId", "summaryId");
    const recordId = requiredString(record, "recordId", "recordId");
    const summarizer = requiredOwnData(record, "summarizer", "summarizer");
    if (typeof summarizer !== "function") {
      fail("CONTEXT_INVALID_INPUT", "Context summarizer must be a function");
    }
    const signalValue = optionalOwnData(record, "signal", undefined);
    const signal = signalValue ?? new AbortController().signal;
    assertAbortSignal(signal);
    return Object.freeze({
      ...boundary,
      maxUnits,
      summaryId,
      recordId,
      summarizer: summarizer as ContextSummarizer,
      signal,
    });
  } catch (error) {
    if (error instanceof ContextCompactionError) throw error;
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      "Context compaction options are invalid",
      { cause: error },
    );
  }
}

async function awaitSummary(
  value: unknown,
  signal: AbortSignal,
): Promise<unknown> {
  const settlement = reflectApply(nativePromiseResolve, NativePromise, [
    value,
  ]) as Promise<unknown>;
  // Attach a rejection handler immediately; it remains attached if
  // cancellation wins and the caller-supplied work rejects later.
  const observed = reflectApply(nativePromiseThen, settlement, [
    (summary: unknown) => ({ kind: "summary" as const, summary }),
    (error: unknown) => ({ kind: "error" as const, error }),
  ]) as Promise<
    | Readonly<{ kind: "summary"; summary: unknown }>
    | Readonly<{ kind: "error"; error: unknown }>
  >;
  if (readAborted(signal)) throw cancelledError(signal);

  let onAbort!: () => void;
  const cancellation = new NativePromise<Readonly<{ kind: "cancelled" }>>(
    (resolve) => {
      onAbort = () => resolve(Object.freeze({ kind: "cancelled" as const }));
      reflectApply(addAbortListener, signal, [
        "abort",
        onAbort,
        { once: true },
      ]);
      if (readAborted(signal)) onAbort();
    },
  );
  try {
    const outcome = await (reflectApply(nativePromiseRace, NativePromise, [
      [observed, cancellation],
    ]) as Promise<
      | Readonly<{ kind: "summary"; summary: unknown }>
      | Readonly<{ kind: "error"; error: unknown }>
      | Readonly<{ kind: "cancelled" }>
    >);
    if (outcome.kind === "cancelled") throw cancelledError(signal);
    if (outcome.kind === "error") {
      throw new ContextCompactionError(
        "CONTEXT_SUMMARIZER_FAILED",
        "Context summarizer rejected",
        { cause: outcome.error },
      );
    }
    return outcome.summary;
  } finally {
    reflectApply(removeAbortListener, signal, ["abort", onAbort]);
  }
}

function throwIfCancelled(signal: AbortSignal): void {
  if (readAborted(signal)) throw cancelledError(signal);
}

function cancelledError(signal: AbortSignal): ContextCompactionError {
  let message = "Context compaction cancelled";
  if (abortSignalReasonGetter !== undefined) {
    try {
      const reason = reflectApply(abortSignalReasonGetter, signal, []);
      if (typeof reason === "string" && reason.length > 0) message = reason;
    } catch {
      // A genuine AbortSignal should not throw, but cancellation stays stable.
    }
  }
  return new ContextCompactionError("CONTEXT_CANCELLED", message);
}

function readAborted(signal: AbortSignal): boolean {
  if (abortSignalAbortedGetter === undefined) {
    fail("CONTEXT_INVALID_INPUT", "AbortSignal.aborted is unavailable");
  }
  try {
    return reflectApply(abortSignalAbortedGetter, signal, []) as boolean;
  } catch (error) {
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      "Context signal must be a genuine AbortSignal",
      { cause: error },
    );
  }
}

function assertAbortSignal(value: unknown): asserts value is AbortSignal {
  if (typeof value !== "object" || value === null) {
    fail("CONTEXT_INVALID_INPUT", "Context signal must be an AbortSignal");
  }
  readAborted(value as AbortSignal);
}

function assertTranscriptValid(messages: readonly CourseMessage[]): void {
  const errors = validateTranscript(messages);
  if (errors.length > 0) {
    fail(
      "CONTEXT_INVALID_TRANSCRIPT",
      `Context transcript is invalid: ${errors[0].code} at message ${errors[0].messageIndex}`,
    );
  }
}

function snapshotArray(
  value: unknown,
  path: string,
  limit: number,
): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail("CONTEXT_INVALID_INPUT", `${path} must be an array`);
  }
  let length: number;
  try {
    length = value.length;
  } catch (error) {
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      `${path} length could not be inspected`,
      { cause: error },
    );
  }
  if (!Number.isSafeInteger(length) || length < 0) {
    fail("CONTEXT_INVALID_INPUT", `${path} length is invalid`);
  }
  if (length > limit) {
    fail("CONTEXT_LIMIT_EXCEEDED", `${path} exceeds its ${limit}-item limit`);
  }
  const snapshot: unknown[] = [];
  for (let index = 0; index < length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, index);
    if (descriptor === undefined || !("value" in descriptor)) {
      fail(
        "CONTEXT_INVALID_INPUT",
        `${path}[${index}] must be an own data item`,
      );
    }
    snapshot.push(descriptor.value);
  }
  return Object.freeze(snapshot);
}

function assertPlainRecord(
  value: unknown,
  path: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail("CONTEXT_INVALID_INPUT", `${path} must be a plain object`);
  }
  let prototype: unknown;
  try {
    prototype = Object.getPrototypeOf(value);
  } catch (error) {
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      `${path} prototype could not be inspected`,
      { cause: error },
    );
  }
  if (prototype !== Object.prototype && prototype !== null) {
    fail("CONTEXT_INVALID_INPUT", `${path} must be a plain object`);
  }
  return value as Record<string, unknown>;
}

function requiredOwnData(
  record: Record<string, unknown>,
  key: string,
  path: string,
): unknown {
  let descriptor: PropertyDescriptor | undefined;
  try {
    descriptor = Object.getOwnPropertyDescriptor(record, key);
  } catch (error) {
    throw new ContextCompactionError(
      "CONTEXT_INVALID_INPUT",
      `${path} could not be inspected`,
      { cause: error },
    );
  }
  if (descriptor === undefined || !("value" in descriptor)) {
    fail("CONTEXT_INVALID_INPUT", `${path} must be an own data property`);
  }
  return descriptor.value;
}

function optionalOwnData(
  record: Record<string, unknown>,
  key: string,
  fallback: unknown,
): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined) return fallback;
  if (!("value" in descriptor)) {
    fail("CONTEXT_INVALID_INPUT", `Context ${key} must be a data property`);
  }
  return descriptor.value;
}

function requiredString(
  record: Record<string, unknown>,
  key: string,
  path: string,
  allowEmpty = false,
  budget?: SnapshotBudget,
): string {
  const value = requiredOwnData(record, key, path);
  assertBoundedString(value, path, "CONTEXT_INVALID_INPUT", budget);
  if (!allowEmpty && value.trim().length === 0) {
    fail("CONTEXT_INVALID_INPUT", `${path} must be non-empty`);
  }
  return value;
}

function assertBoundedString(
  value: unknown,
  path: string,
  code: ContextCompactionErrorCode = "CONTEXT_INVALID_INPUT",
  budget?: SnapshotBudget,
): asserts value is string {
  if (typeof value !== "string") fail(code, `${path} must be a string`);
  const units = unicodeUnits(value);
  if (units > MAX_CONTEXT_STRING_UNITS) {
    fail("CONTEXT_LIMIT_EXCEEDED", `${path} exceeds its string-unit limit`);
  }
  if (budget !== undefined) {
    budget.stringUnits += units;
    if (budget.stringUnits > MAX_CONTEXT_TOTAL_UNITS) {
      fail(
        "CONTEXT_LIMIT_EXCEEDED",
        `Context input exceeds ${MAX_CONTEXT_TOTAL_UNITS} aggregate string units`,
      );
    }
  }
}

function requiredBudgetInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
): number {
  const value = requiredOwnData(record, key, path);
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(
      "CONTEXT_INVALID_BUDGET",
      `${path} must be a safe integer >= ${minimum}`,
    );
  }
  return value as number;
}

function requiredSafeInteger(
  record: Record<string, unknown>,
  key: string,
  path: string,
  minimum: number,
): number {
  const value = requiredOwnData(record, key, path);
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    fail(
      "CONTEXT_INVALID_INPUT",
      `${path} must be a safe integer >= ${minimum}`,
    );
  }
  return value as number;
}

function addCollectionItems(budget: SnapshotBudget, count: number): void {
  budget.collectionItems += count;
  if (budget.collectionItems > MAX_CONTEXT_COLLECTION_ITEMS) {
    fail(
      "CONTEXT_LIMIT_EXCEEDED",
      `Context exceeds ${MAX_CONTEXT_COLLECTION_ITEMS} collection items`,
    );
  }
}

function fail(code: ContextCompactionErrorCode, message: string): never {
  throw new ContextCompactionError(code, message);
}
