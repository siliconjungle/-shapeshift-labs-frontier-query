import assert from 'node:assert';
import {
  cloneQueryCondition,
  collectQueryConditionFields,
  hashQueryKey,
  identifyQueryEntity,
  isSpecialQueryPath,
  matchesQueryConditions,
  normalizeQueryPath,
  normalizeQuerySchema,
  partialMatchQueryKey,
  readQueryCondition,
  readQueryConditionEqualityHint,
  readQueryConditionValue
} from '../dist/index.js';

assert.strictEqual(
  hashQueryKey(['todos', { status: 'open', page: 1 }]),
  hashQueryKey(['todos', { page: 1, status: 'open' }])
);
assert.ok(partialMatchQueryKey(['todos', { page: 1, status: 'open' }], ['todos', { status: 'open' }]));
assert.deepStrictEqual(normalizeQueryPath('/rows/0/name'), ['rows', '0', 'name']);
assert.deepStrictEqual(normalizeQueryPath('rows.0.name'), ['rows', '0', 'name']);

const row = {
  id: 'a',
  kind: 'todo',
  done: false,
  priority: 4,
  owner: { id: 'u1' }
};

assert.ok(matchesQueryConditions(row, [
  readQueryCondition('kind', 'eq', 'todo'),
  { field: 'priority', gte: 3 },
  { field: 'missing', exists: false }
]));
assert.ok(matchesQueryConditions(row, [
  { field: '$key', eq: 'a' },
  { field: '$index', eq: 2 },
  { field: '$mapKey', eq: 'row-a' }
], { key: 'a', rowIndex: 2, mapKey: 'row-a' }));
const mutableCondition = { field: 'owner.id', eq: 'u1' };
assert.ok(matchesQueryConditions(row, [mutableCondition]));
mutableCondition.field = 'kind';
mutableCondition.eq = 'todo';
assert.ok(matchesQueryConditions(row, [mutableCondition]));
const mutableArrayField = { field: ['owner', 'id'], eq: 'u1' };
assert.ok(matchesQueryConditions(row, [mutableArrayField]));
mutableArrayField.field[0] = 'kind';
mutableArrayField.field.length = 1;
mutableArrayField.eq = 'todo';
assert.ok(matchesQueryConditions(row, [mutableArrayField]));
assert.strictEqual(readQueryConditionValue(row, ['owner', 'id']), 'u1');
assert.strictEqual(isSpecialQueryPath(['$index']), true);

const fields = [];
collectQueryConditionFields([
  { field: 'kind', eq: 'todo' },
  { or: [{ field: 'owner.id', eq: 'u1' }, { field: ['owner', 'id'], eq: 'u2' }] }
], fields);
assert.deepStrictEqual(fields, [['kind'], ['owner', 'id'], ['owner', 'id']]);
assert.deepStrictEqual(readQueryConditionEqualityHint([
  { field: 'id', in: ['a', 'b', { nested: true }] },
  { or: [{ field: 'id', eq: 'a' }, { field: 'id', eq: 'c' }] }
], ['id']), ['a']);
assert.deepStrictEqual(
  cloneQueryCondition({ and: [{ field: 'owner.id', in: ['u1', 'u2'] }] }),
  { and: [{ field: ['owner', 'id'], in: ['u1', 'u2'] }] }
);
assert.deepStrictEqual(normalizeQuerySchema({
  tables: [{ path: 'todos', key: 'id', selectorFields: ['done', 'owner.id'] }],
  entities: [{ path: '/users', key: 'id' }]
}).tables.map((table) => table.path), [['todos'], ['users']]);
assert.strictEqual(identifyQueryEntity({ __typename: 'Todo', id: false }), 'Todo:false');

console.log('frontier query smoke passed');
