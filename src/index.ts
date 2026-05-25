/** JSON primitive values supported by Frontier query primitives. */
export type JsonPrimitive = null | boolean | number | string;

/** Any JSON-shaped value accepted by the public API. */
export type JsonValue = JsonPrimitive | JsonObject | JsonArray;

/** A plain JSON object. */
export interface JsonObject {
  [key: string]: JsonValue;
}

/** A JSON array. */
export interface JsonArray extends Array<JsonValue> {}

export type PathSegment = string | number;
export type JsonPath = PathSegment[];
export type ObjectKey = string | number;

const hasOwn = Object.prototype.hasOwnProperty;
type ConditionPathCacheEntry = { field: string; path: JsonPath };
const conditionPathCache = new WeakMap<object, ConditionPathCacheEntry>();

export type QueryPath = string | JsonPath;
export type QueryKey = JsonValue;

export type QueryOperator =
  | '=='
  | 'eq'
  | '!='
  | 'neq'
  | '>'
  | 'gt'
  | '>='
  | 'gte'
  | '<'
  | 'lt'
  | '<='
  | 'lte'
  | 'in'
  | 'exists';

export type ResolvedQueryOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'exists';

export type QueryCondition =
  | { field: QueryPath; op?: QueryOperator; value?: JsonValue | JsonValue[]; eq?: JsonValue; neq?: JsonValue; gt?: number; gte?: number; lt?: number; lte?: number; in?: JsonValue[]; exists?: boolean }
  | { and: QueryCondition[] }
  | { or: QueryCondition[] }
  | { not: QueryCondition };

export interface QueryConditionMeta {
  key?: ObjectKey;
  rowIndex?: number;
  mapKey?: string;
}

export interface QueryTableSchema {
  /** Path to an array table or object-map table, without the wildcard segment. */
  path: QueryPath;
  /** Stable row identity field. */
  key?: QueryPath;
  /** Trusted claim that row objects have a stable field layout. */
  stableRowShape?: boolean;
  /** Fields known to contain numbers. */
  numericFields?: QueryPath[];
  /** Fields known to contain strings. */
  textFields?: QueryPath[];
  /** Fields known to contain arrays/lists. */
  listFields?: QueryPath[];
  /** Fields expected to participate in selector/query predicates for this table. */
  selectorFields?: QueryPath[];
}

export interface QueryShapeSchema {
  tables?: QueryTableSchema[];
  /** Alias for table-like entity collections. */
  entities?: QueryTableSchema[];
}

export type QuerySchemaInput = QueryShapeSchema | QueryTableSchema[];

export interface NormalizedQueryTableSchema {
  path: JsonPath;
  key?: JsonPath;
  stableRowShape: boolean;
  numericFields: JsonPath[];
  textFields: JsonPath[];
  listFields: JsonPath[];
  selectorFields: JsonPath[];
}

export interface NormalizedQuerySchema {
  tables: NormalizedQueryTableSchema[];
}

export interface QueryEntityIdentifyContext {
  path: JsonPath;
  typenameField: string;
  idFields: readonly string[];
}

export interface QueryEntityIdentifyOptions {
  typenameField?: string;
  idFields?: readonly string[];
  identify?: (value: JsonObject, context: QueryEntityIdentifyContext) => string | number | boolean | null | undefined;
}

export type QueryEntityInput =
  | string
  | {
      __typename?: JsonValue;
      id?: JsonValue;
      _id?: JsonValue;
      [key: string]: JsonValue | undefined;
    };

export function hashQueryKey(key: QueryKey): string {
  return stableQueryStringify(key) || 'null';
}

export function partialMatchQueryKey(candidate: QueryKey, partial: QueryKey): boolean {
  if (candidate === partial) return true;
  if (Array.isArray(candidate) && Array.isArray(partial)) {
    if (partial.length > candidate.length) return false;
    for (let i = 0; i < partial.length; i++) {
      if (!partialMatchQueryKey(candidate[i], partial[i])) return false;
    }
    return true;
  }
  if (isJsonObject(candidate) && isJsonObject(partial)) {
    const keys = Object.keys(partial);
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i];
      if (!hasOwn.call(candidate, key) || !partialMatchQueryKey(candidate[key], partial[key])) return false;
    }
    return true;
  }
  return false;
}

export function normalizeQueryPath(path: QueryPath | undefined, label = 'query path'): JsonPath {
  if (path === undefined) return [];
  if (Array.isArray(path)) return path.slice();
  if (typeof path !== 'string') throw new TypeError(label + ' must be a JSON pointer string or path array');
  if (path.length === 0) return [];
  if (path[0] === '/') return parsePointer(path);
  return path.split('.').filter(Boolean);
}

export function normalizeQuerySchema(schema: QuerySchemaInput | undefined, label = 'query schema'): NormalizedQuerySchema {
  if (schema === undefined) return { tables: [] };
  const entries = Array.isArray(schema)
    ? schema
    : (schema.tables || []).concat(schema.entities || []);
  const tables: NormalizedQueryTableSchema[] = [];
  for (const table of entries) {
    const normalized: NormalizedQueryTableSchema = {
      path: normalizeQueryPath(table.path, label + ' table path'),
      key: table.key === undefined ? undefined : normalizeQueryPath(table.key, label + ' key'),
      stableRowShape: table.stableRowShape !== false,
      numericFields: normalizeQuerySchemaFields(table.numericFields, label + ' numericFields'),
      textFields: normalizeQuerySchemaFields(table.textFields, label + ' textFields'),
      listFields: normalizeQuerySchemaFields(table.listFields, label + ' listFields'),
      selectorFields: normalizeQuerySchemaFields(table.selectorFields, label + ' selectorFields')
    };
    if (normalized.path.length === 0) throw new TypeError(label + ' table path must not be root');
    tables.push(normalized);
  }
  return { tables };
}

export function collectQueryConditionFields(conditions: readonly QueryCondition[], out: JsonPath[]): void {
  for (const condition of conditions) collectQueryConditionField(condition, out);
}

export function readQueryCondition(fieldOrCondition: QueryPath | QueryCondition, op?: QueryOperator, value?: JsonValue | JsonValue[]): QueryCondition {
  if (typeof fieldOrCondition === 'string' || Array.isArray(fieldOrCondition)) {
    return { field: fieldOrCondition, op: op || 'eq', value };
  }
  return cloneQueryCondition(fieldOrCondition);
}

export function cloneQueryCondition(condition: QueryCondition): QueryCondition {
  if ('and' in condition) return { and: condition.and.map(cloneQueryCondition) };
  if ('or' in condition) return { or: condition.or.map(cloneQueryCondition) };
  if ('not' in condition) return { not: cloneQueryCondition(condition.not) };
  return {
    ...condition,
    field: normalizeQueryPath(condition.field, 'condition field'),
    in: condition.in === undefined ? undefined : condition.in.slice()
  };
}

export function matchesQueryConditions(
  value: JsonValue | undefined,
  conditions: readonly QueryCondition[],
  meta?: QueryConditionMeta
): boolean {
  for (const condition of conditions) {
    if (!evaluateQueryCondition(value, condition, meta)) return false;
  }
  return true;
}

export function readQueryConditionValue(
  value: JsonValue | undefined,
  field: JsonPath,
  meta?: QueryConditionMeta
): JsonValue | undefined {
  if (field.length === 1 && field[0] === '$key') return meta?.key as JsonValue | undefined;
  if (field.length === 1 && field[0] === '$index') return meta?.rowIndex as JsonValue | undefined;
  if (field.length === 1 && field[0] === '$mapKey') return meta?.mapKey;
  if (value === undefined) return undefined;
  return getPath(value, field);
}

export function isSpecialQueryPath(path: JsonPath): boolean {
  return path.length === 1 && (
    path[0] === '$key' ||
    path[0] === '$index' ||
    path[0] === '$mapKey'
  );
}

export function readQueryConditionEqualityHint(
  conditions: readonly QueryCondition[],
  field: JsonPath
): ObjectKey[] | undefined {
  let values: ObjectKey[] | undefined;
  for (const condition of conditions) {
    const next = readSingleConditionEqualityHint(condition, field);
    if (next === undefined) continue;
    values = values === undefined ? next : intersectObjectKeys(values, next);
  }
  return values;
}

export function normalizeQueryOperator(
  condition: Extract<QueryCondition, { field: QueryPath }>
): ResolvedQueryOperator {
  if (condition.eq !== undefined) return 'eq';
  if (condition.neq !== undefined) return 'neq';
  if (condition.gt !== undefined) return 'gt';
  if (condition.gte !== undefined) return 'gte';
  if (condition.lt !== undefined) return 'lt';
  if (condition.lte !== undefined) return 'lte';
  if (condition.in !== undefined) return 'in';
  if (condition.exists !== undefined) return 'exists';
  const op = condition.op || 'eq';
  if (op === '==' || op === 'eq') return 'eq';
  if (op === '!=' || op === 'neq') return 'neq';
  if (op === '>' || op === 'gt') return 'gt';
  if (op === '>=' || op === 'gte') return 'gte';
  if (op === '<' || op === 'lt') return 'lt';
  if (op === '<=' || op === 'lte') return 'lte';
  if (op === 'in') return 'in';
  if (op === 'exists') return 'exists';
  throw new TypeError('unsupported query operator: ' + op);
}

export function readQueryConditionExpected(
  condition: Extract<QueryCondition, { field: QueryPath }>,
  op: ResolvedQueryOperator
): JsonValue | JsonValue[] | boolean | undefined {
  if (op === 'eq' && condition.eq !== undefined) return condition.eq;
  if (op === 'neq' && condition.neq !== undefined) return condition.neq;
  if (op === 'gt' && condition.gt !== undefined) return condition.gt;
  if (op === 'gte' && condition.gte !== undefined) return condition.gte;
  if (op === 'lt' && condition.lt !== undefined) return condition.lt;
  if (op === 'lte' && condition.lte !== undefined) return condition.lte;
  if (op === 'in' && condition.in !== undefined) return condition.in;
  if (op === 'exists' && condition.exists !== undefined) return condition.exists;
  return condition.value;
}

export function identifyQueryEntity(
  input: QueryEntityInput,
  options: QueryEntityIdentifyOptions = {},
  path: JsonPath = []
): string | null {
  if (typeof input === 'string') return input;
  if (!isJsonObject(input)) return null;
  const typenameField = options.typenameField || '__typename';
  const idFields = options.idFields || ['id', '_id'];
  const custom = options.identify ? options.identify(input, { path, typenameField, idFields }) : undefined;
  if (custom !== undefined && custom !== null) return String(custom);
  const typename = input[typenameField];
  if (typeof typename !== 'string' || typename.length === 0) return null;
  for (let i = 0; i < idFields.length; i++) {
    const id = input[idFields[i]];
    if (isQueryEntityIdValue(id)) return typename + ':' + String(id);
  }
  return null;
}

function normalizeQuerySchemaFields(fields: QueryPath[] | undefined, label: string): JsonPath[] {
  if (fields === undefined) return [];
  if (!Array.isArray(fields)) throw new TypeError(label + ' must be an array');
  return fields.map((field) => normalizeQueryPath(field, label));
}

function collectQueryConditionField(condition: QueryCondition, out: JsonPath[]): void {
  if ('and' in condition) {
    collectQueryConditionFields(condition.and, out);
  } else if ('or' in condition) {
    collectQueryConditionFields(condition.or, out);
  } else if ('not' in condition) {
    collectQueryConditionField(condition.not, out);
  } else {
    out.push(normalizeQueryPath(condition.field, 'condition field'));
  }
}

function evaluateQueryCondition(
  value: JsonValue | undefined,
  condition: QueryCondition,
  meta?: QueryConditionMeta
): boolean {
  if ('and' in condition) return condition.and.every((item) => evaluateQueryCondition(value, item, meta));
  if ('or' in condition) return condition.or.some((item) => evaluateQueryCondition(value, item, meta));
  if ('not' in condition) return !evaluateQueryCondition(value, condition.not, meta);
  const actual = readQueryConditionValue(value, readConditionPath(condition), meta);
  const op = normalizeQueryOperator(condition);
  const expected = readQueryConditionExpected(condition, op);
  if (op === 'exists') return expected === false ? actual === undefined : actual !== undefined;
  if (op === 'eq') return Object.is(actual, expected);
  if (op === 'neq') return !Object.is(actual, expected);
  if (op === 'in') return Array.isArray(expected) && expected.some((item) => Object.is(actual, item));
  if (typeof actual !== 'number' || typeof expected !== 'number') return false;
  if (op === 'gt') return actual > expected;
  if (op === 'gte') return actual >= expected;
  if (op === 'lt') return actual < expected;
  if (op === 'lte') return actual <= expected;
  return false;
}

function readSingleConditionEqualityHint(condition: QueryCondition, field: JsonPath): ObjectKey[] | undefined {
  if ('and' in condition) return readQueryConditionEqualityHint(condition.and, field);
  if ('or' in condition) {
    let values: ObjectKey[] = [];
    for (const item of condition.or) {
      const next = readSingleConditionEqualityHint(item, field);
      if (next === undefined) return undefined;
      values = values.concat(next);
    }
    return uniqueObjectKeys(values);
  }
  if ('not' in condition) return undefined;
  if (!samePath(readConditionPath(condition), field)) return undefined;
  const op = normalizeQueryOperator(condition);
  if (op !== 'eq' && op !== 'in') return undefined;
  const expected = readQueryConditionExpected(condition, op);
  const values = op === 'in' && Array.isArray(expected) ? expected : [expected];
  const keys: ObjectKey[] = [];
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') keys.push(value);
  }
  return keys.length === 0 ? undefined : uniqueObjectKeys(keys);
}

function readConditionPath(condition: Extract<QueryCondition, { field: QueryPath }>): JsonPath {
  if (Array.isArray(condition.field)) return condition.field.slice();
  const cached = conditionPathCache.get(condition);
  if (cached !== undefined && cached.field === condition.field) return cached.path;
  const path = normalizeQueryPath(condition.field, 'condition field');
  conditionPathCache.set(condition, { field: condition.field, path });
  return path;
}

function getPath(value: JsonValue, path: JsonPath): JsonValue | undefined {
  let node: JsonValue | undefined = value;
  for (let i = 0; i < path.length; i++) {
    if (node === null || node === undefined) return undefined;
    node = (node as any)[path[i]];
  }
  return node;
}

function parsePointer(pointer: string): JsonPath {
  if (pointer === '') return [];
  if (typeof pointer !== 'string' || pointer.charCodeAt(0) !== 47) {
    throw new TypeError('JSON Pointer must start with /');
  }
  const path: JsonPath = [];
  let start = 1;
  for (let i = 1, length = pointer.length; i <= length; i++) {
    if (i === length || pointer.charCodeAt(i) === 47) {
      path[path.length] = decodePointerSegment(pointer, start, i);
      start = i + 1;
    }
  }
  return path;
}

function decodePointerSegment(pointer: string, start: number, end: number): string {
  let tilde = -1;
  for (let i = start; i < end; i++) {
    if (pointer.charCodeAt(i) === 126) {
      tilde = i;
      break;
    }
  }

  if (tilde === -1) return pointer.slice(start, end);

  let out = pointer.slice(start, tilde);
  let chunkStart = tilde + 2;
  for (let i = tilde; i < end; i++) {
    if (pointer.charCodeAt(i) !== 126) continue;
    const next = pointer.charCodeAt(i + 1);
    if (next === 48) {
      out += pointer.slice(chunkStart, i) + '~';
    } else if (next === 49) {
      out += pointer.slice(chunkStart, i) + '/';
    } else {
      throw new TypeError('invalid JSON Pointer escape in segment: ' + pointer.slice(start, end));
    }
    i++;
    chunkStart = i + 1;
  }

  if (chunkStart < end) out += pointer.slice(chunkStart, end);
  return out;
}

function uniqueObjectKeys(values: ObjectKey[]): ObjectKey[] {
  const out: ObjectKey[] = [];
  for (const value of values) {
    if (!out.some((existing) => Object.is(existing, value))) out.push(value);
  }
  return out;
}

function intersectObjectKeys(left: ObjectKey[], right: ObjectKey[]): ObjectKey[] {
  const out: ObjectKey[] = [];
  for (const value of left) {
    if (right.some((candidate) => Object.is(candidate, value))) out.push(value);
  }
  return uniqueObjectKeys(out);
}

function samePath(left: JsonPath, right: JsonPath): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function stableQueryStringify(value: unknown): string | undefined {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'number' || type === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) {
    let out = '[';
    for (let i = 0; i < value.length; i++) {
      if (i !== 0) out += ',';
      out += stableQueryStringify(value[i]) || 'null';
    }
    return out + ']';
  }
  if (!isPlainObject(value)) return undefined;
  const keys = Object.keys(value).sort();
  let out = '{';
  let written = 0;
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const encoded = stableQueryStringify((value as Record<string, unknown>)[key]);
    if (encoded === undefined) continue;
    if (written++ !== 0) out += ',';
    out += JSON.stringify(key) + ':' + encoded;
  }
  return out + '}';
}

function isQueryEntityIdValue(value: unknown): value is string | number | boolean {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';
}

function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
