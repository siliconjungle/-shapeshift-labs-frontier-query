import {
  cloneQueryCondition,
  collectQueryConditionFields,
  hashQueryKey,
  identifyQueryEntity,
  matchesQueryConditions,
  normalizeQueryPath,
  normalizeQuerySchema,
  partialMatchQueryKey,
  readQueryCondition,
  readQueryConditionEqualityHint,
  readQueryConditionExpected,
  readQueryConditionValue,
  type JsonPath,
  type JsonValue,
  type NormalizedQuerySchema,
  type ObjectKey,
  type QueryCondition,
  type QueryEntityIdentifyContext,
  type QueryPath,
  type QuerySchemaInput
} from '../dist/index.js';

const pointerPath: JsonPath = normalizeQueryPath('/todos/0/title');
const dotPath: JsonPath = normalizeQueryPath('todos.0.title');
const queryPath: QueryPath = dotPath;
const schemaInput: QuerySchemaInput = {
  tables: [
    {
      path: '/todos',
      key: 'id',
      stableRowShape: true,
      numericFields: ['priority'],
      textFields: ['title'],
      listFields: ['tags'],
      selectorFields: ['done', 'owner.id']
    }
  ]
};
const schema: NormalizedQuerySchema = normalizeQuerySchema(schemaInput);
const condition: QueryCondition = readQueryCondition(queryPath, 'eq', 'hello');
const cloned: QueryCondition = cloneQueryCondition(condition);
const fields: JsonPath[] = [];
collectQueryConditionFields([cloned], fields);

const row: JsonValue = {
  __typename: 'Todo',
  id: 't1',
  title: 'hello',
  done: false,
  priority: 3,
  owner: { id: 'u1' },
  tags: ['work']
};
const key: string = hashQueryKey(['todos', { done: false, page: 1 }]);
const partialMatched: boolean = partialMatchQueryKey(['todos', { done: false, page: 1 }], ['todos', { done: false }]);
const matched: boolean = matchesQueryConditions(row, [
  { field: 'title', eq: 'hello' },
  { field: 'priority', gte: 2 },
  { field: '$index', eq: 0 }
], { key: 't1', rowIndex: 0 });
const value: JsonValue | undefined = readQueryConditionValue(row, ['owner', 'id']);
const hint: ObjectKey[] | undefined = readQueryConditionEqualityHint([{ field: 'id', in: ['t1', 't2'] }], ['id']);
const expected: JsonValue | JsonValue[] | boolean | undefined = readQueryConditionExpected({ field: 'done', eq: false }, 'eq');
const entityId: string | null = identifyQueryEntity(row, {
  identify(value, context: QueryEntityIdentifyContext) {
    const id = value.id;
    return value[context.typenameField] === 'Todo' &&
      (typeof id === 'string' || typeof id === 'number' || typeof id === 'boolean')
      ? id
      : undefined;
  }
});

void pointerPath;
void schema;
void fields;
void key;
void partialMatched;
void matched;
void value;
void hint;
void expected;
void entityId;
