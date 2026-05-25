import assert from 'node:assert';
import {
  hashQueryKey,
  identifyQueryEntity,
  matchesQueryConditions,
  normalizeQueryPath,
  normalizeQuerySchema,
  partialMatchQueryKey,
  readQueryConditionEqualityHint
} from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 1000);
let seed = readUint(args.seed, 0x7182d59b);
const initialSeed = seed;

for (let i = 0; i < cases; i++) {
  checkHashStability();
  checkPartialMatch();
  checkConditions();
  checkSchema();
  checkEntityIdentity();
}

console.log(`frontier query fuzz passed cases=${cases} seed=${initialSeed}`);

function checkHashStability() {
  const value = randomJson(0);
  const shuffled = shuffleObjectKeys(value);
  assert.strictEqual(hashQueryKey(value), hashQueryKey(shuffled));
}

function checkPartialMatch() {
  const candidate = randomJson(0);
  const partial = carvePartial(candidate);
  assert.strictEqual(partialMatchQueryKey(candidate, partial), referencePartialMatch(candidate, partial));
  const unrelated = randomJson(0);
  assert.strictEqual(partialMatchQueryKey(candidate, unrelated), referencePartialMatch(candidate, unrelated));
}

function checkConditions() {
  const row = {
    id: 'id-' + randomInt(5),
    kind: choose(['todo', 'note', 'event']),
    done: randomBool(),
    score: randomInt(20) - 5,
    owner: { id: 'u-' + randomInt(4) },
    tags: [choose(['work', 'home', 'urgent'])]
  };
  const conditions = [
    { field: 'kind', eq: row.kind },
    { field: 'score', gte: row.score - randomInt(3) },
    { field: 'owner.id', in: [row.owner.id, 'other'] },
    { field: 'missing', exists: false },
    {
      or: [
        { field: '$key', eq: row.id },
        { field: '$index', eq: 99 }
      ]
    }
  ];
  const meta = { key: row.id, rowIndex: randomInt(20), mapKey: 'map-' + row.id };
  assert.strictEqual(matchesQueryConditions(row, conditions, meta), referenceMatches(row, conditions, meta));

  const hint = readQueryConditionEqualityHint([
    { field: 'id', in: [row.id, 'not-' + row.id, { nested: true }] },
    { or: [{ field: 'id', eq: row.id }, { field: 'id', eq: 'other' }] }
  ], ['id']);
  assert.deepStrictEqual(hint, [row.id]);
}

function checkSchema() {
  const schema = normalizeQuerySchema({
    tables: [
      {
        path: choose(['/todos', 'todos', ['todos']]),
        key: choose(['id', '/id', ['id']]),
        stableRowShape: randomBool(),
        numericFields: ['score', 'owner.rank'],
        textFields: ['/kind'],
        listFields: [['tags']],
        selectorFields: ['done', '/owner/id']
      }
    ],
    entities: [
      { path: '/users', key: 'id' }
    ]
  });
  assert.deepStrictEqual(schema.tables.map((table) => table.path), [['todos'], ['users']]);
  assert.deepStrictEqual(schema.tables[0].selectorFields, [['done'], ['owner', 'id']]);
}

function checkEntityIdentity() {
  const id = choose(['a', 1, false]);
  assert.strictEqual(identifyQueryEntity({ __typename: 'Todo', id }), 'Todo:' + String(id));
  assert.strictEqual(identifyQueryEntity({ __typename: 'Todo', nested: { id: 'x' } }), null);
  assert.strictEqual(identifyQueryEntity({ type: 'Todo', key: 'x' }, {
    typenameField: 'type',
    idFields: ['key']
  }), 'Todo:x');
  assert.strictEqual(identifyQueryEntity({ __typename: 'Todo', id: 'x' }, {
    identify(value, context) {
      return context.path.join('/') + ':' + value.id;
    }
  }, ['root', 'todos']), 'root/todos:x');
}

function referenceMatches(value, conditions, meta) {
  for (const condition of conditions) {
    if (!referenceEvaluate(value, condition, meta)) return false;
  }
  return true;
}

function referenceEvaluate(value, condition, meta) {
  if ('and' in condition) return condition.and.every((item) => referenceEvaluate(value, item, meta));
  if ('or' in condition) return condition.or.some((item) => referenceEvaluate(value, item, meta));
  if ('not' in condition) return !referenceEvaluate(value, condition.not, meta);
  const field = normalizeQueryPath(condition.field);
  const actual = readPath(value, field, meta);
  const op = condition.eq !== undefined ? 'eq'
    : condition.neq !== undefined ? 'neq'
      : condition.gt !== undefined ? 'gt'
        : condition.gte !== undefined ? 'gte'
          : condition.lt !== undefined ? 'lt'
            : condition.lte !== undefined ? 'lte'
              : condition.in !== undefined ? 'in'
                : condition.exists !== undefined ? 'exists'
                  : normalizeOperator(condition.op || 'eq');
  const expected = condition[op] !== undefined ? condition[op] : condition.value;
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

function normalizeOperator(op) {
  if (op === '==' || op === 'eq') return 'eq';
  if (op === '!=' || op === 'neq') return 'neq';
  if (op === '>' || op === 'gt') return 'gt';
  if (op === '>=' || op === 'gte') return 'gte';
  if (op === '<' || op === 'lt') return 'lt';
  if (op === '<=' || op === 'lte') return 'lte';
  return op;
}

function readPath(value, path, meta) {
  if (path.length === 1 && path[0] === '$key') return meta?.key;
  if (path.length === 1 && path[0] === '$index') return meta?.rowIndex;
  if (path.length === 1 && path[0] === '$mapKey') return meta?.mapKey;
  let node = value;
  for (const segment of path) {
    if (node === null || node === undefined) return undefined;
    node = node[segment];
  }
  return node;
}

function referencePartialMatch(candidate, partial) {
  if (candidate === partial) return true;
  if (Array.isArray(candidate) && Array.isArray(partial)) {
    if (partial.length > candidate.length) return false;
    for (let i = 0; i < partial.length; i++) {
      if (!referencePartialMatch(candidate[i], partial[i])) return false;
    }
    return true;
  }
  if (isPlainObject(candidate) && isPlainObject(partial)) {
    for (const key of Object.keys(partial)) {
      if (!Object.prototype.hasOwnProperty.call(candidate, key)) return false;
      if (!referencePartialMatch(candidate[key], partial[key])) return false;
    }
    return true;
  }
  return false;
}

function carvePartial(value) {
  if (Array.isArray(value)) {
    const length = randomInt(value.length + 1);
    return value.slice(0, length).map(carvePartial);
  }
  if (isPlainObject(value)) {
    const out = {};
    for (const key of Object.keys(value)) {
      if (randomBool()) out[key] = carvePartial(value[key]);
    }
    return out;
  }
  return value;
}

function shuffleObjectKeys(value) {
  if (Array.isArray(value)) return value.map(shuffleObjectKeys);
  if (!isPlainObject(value)) return value;
  const keys = Object.keys(value);
  for (let i = keys.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const tmp = keys[i];
    keys[i] = keys[j];
    keys[j] = tmp;
  }
  const out = {};
  for (const key of keys) out[key] = shuffleObjectKeys(value[key]);
  return out;
}

function randomJson(depth) {
  if (depth > 3) return randomScalar();
  const kind = randomInt(5);
  if (kind <= 1) return randomScalar();
  if (kind === 2) {
    const length = randomInt(5);
    const out = new Array(length);
    for (let i = 0; i < length; i++) out[i] = randomJson(depth + 1);
    return out;
  }
  const length = randomInt(5);
  const out = {};
  for (let i = 0; i < length; i++) out['k' + i + '_' + randomInt(4)] = randomJson(depth + 1);
  return out;
}

function randomScalar() {
  switch (randomInt(4)) {
    case 0: return null;
    case 1: return randomBool();
    case 2: return randomInt(50) - 10;
    default: return choose(['a', 'b', 'c', '']);
  }
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function choose(values) {
  return values[randomInt(values.length)];
}

function randomBool() {
  return (nextRandom() & 1) === 1;
}

function randomInt(max) {
  return max <= 1 ? 0 : nextRandom() % max;
}

function nextRandom() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cases') out.cases = argv[++i];
    else if (arg === '--seed') out.seed = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: node test/fuzz.mjs [--cases 1000] [--seed 1904399771]');
      process.exit(0);
    } else {
      throw new Error('unknown argument: ' + arg);
    }
  }
  return out;
}

function readPositiveInt(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error('expected positive integer, got ' + value);
  return number;
}

function readUint(value, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error('expected integer seed, got ' + value);
  return number >>> 0;
}
