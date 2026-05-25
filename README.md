# Frontier Query

Shared query, selector, and table-shape primitives for Frontier packages.

Repository: [siliconjungle/-shapeshift-labs-frontier-query](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)

This package is intentionally small. It does not own a cache, query runtime, state engine, mutation planner, CRDT layer, or patch codec. It only provides the vocabulary that Frontier state-cache and mutation packages need to interpret identically.

```sh
npm install @shapeshift-labs/frontier-query
```

```js
import {
  hashQueryKey,
  matchesQueryConditions,
  normalizeQueryPath
} from '@shapeshift-labs/frontier-query';

const key = hashQueryKey(['todos', { status: 'open', page: 1 }]);
const path = normalizeQueryPath('/todos/0/title');
const matches = matchesQueryConditions(
  { id: 't1', done: false, priority: 4 },
  [{ field: 'priority', gte: 3 }, { field: 'done', eq: false }]
);
```

## API

- `hashQueryKey(key)` creates a deterministic JSON query-key string with stable object-key ordering.
- `partialMatchQueryKey(candidate, partial)` supports prefix/object-subset invalidation checks.
- `normalizeQueryPath(path, label?)` accepts JSON pointer strings, dot paths, or path arrays.
- `normalizeQuerySchema(schema, label?)` normalizes trusted table/entity schema hints.
- `readQueryCondition(fieldOrCondition, op?, value?)` creates or clones condition objects.
- `matchesQueryConditions(value, conditions, meta?)` evaluates selector/query predicates.
- `readQueryConditionEqualityHint(conditions, field)` extracts equality/in hints for indexes.
- `identifyQueryEntity(input, options?, path?)` implements `__typename` plus `id`/`_id` identity with custom overrides.

Special condition fields:

- `$key` is the current object-map key or resolved row key.
- `$index` is the current array row index.
- `$mapKey` is the current object-map key when it should be kept distinct from `keyBy()`.

## Package Boundary

Use this package when multiple Frontier layers must agree on selector/query semantics. Keep runtimes elsewhere:

- normalized query-result storage belongs in state-cache,
- write planning belongs in `@shapeshift-labs/frontier-mutation`,
- patch routing and owned app state belong in Frontier state packages,
- compact diff/apply stays in `@shapeshift-labs/frontier`.

## License

MIT. See [LICENSE](./LICENSE).
