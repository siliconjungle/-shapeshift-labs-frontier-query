# Frontier Query

Shared query, selector, and table-shape primitives for Frontier packages.

- npm: [`@shapeshift-labs/frontier-query`](https://www.npmjs.com/package/@shapeshift-labs/frontier-query)
- source: [`siliconjungle/-shapeshift-labs-frontier-query`](https://github.com/siliconjungle/-shapeshift-labs-frontier-query)
- license: MIT

## Related Packages

- [`@shapeshift-labs/frontier`](https://www.npmjs.com/package/@shapeshift-labs/frontier): core JSON diff/apply primitives.
- [`@shapeshift-labs/frontier-codec`](https://www.npmjs.com/package/@shapeshift-labs/frontier-codec): patch serialization, binary frames, canonical JSON, and patch-history codecs.
- [`@shapeshift-labs/frontier-engine`](https://www.npmjs.com/package/@shapeshift-labs/frontier-engine): planned diff engine, adaptive profiles, and reusable schema/history planning.
- [`@shapeshift-labs/frontier-mutation`](https://www.npmjs.com/package/@shapeshift-labs/frontier-mutation): explicit mutation and selector plans that use this package's shared selector vocabulary.

Package source repositories:

- [`siliconjungle/-shapeshift-labs-frontier`](https://github.com/siliconjungle/-shapeshift-labs-frontier)
- [`siliconjungle/-shapeshift-labs-frontier-codec`](https://github.com/siliconjungle/-shapeshift-labs-frontier-codec)
- [`siliconjungle/-shapeshift-labs-frontier-engine`](https://github.com/siliconjungle/-shapeshift-labs-frontier-engine)
- [`siliconjungle/-shapeshift-labs-frontier-mutation`](https://github.com/siliconjungle/-shapeshift-labs-frontier-mutation)

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

### Query Keys

- `hashQueryKey(key)` creates a deterministic JSON query-key string with stable object-key ordering.
- `partialMatchQueryKey(candidate, partial)` supports prefix/object-subset invalidation checks.

### Paths And Schemas

- `normalizeQueryPath(path, label?)` accepts JSON pointer strings, dot paths, or path arrays.
- `normalizeQuerySchema(schema, label?)` normalizes trusted table/entity schema hints.

### Conditions

- `readQueryCondition(fieldOrCondition, op?, value?)` creates or clones condition objects.
- `cloneQueryCondition(condition)` clones nested condition trees and normalizes condition paths.
- `collectQueryConditionFields(conditions, out)` records every field path read by a condition tree.
- `matchesQueryConditions(value, conditions, meta?)` evaluates selector/query predicates.
- `readQueryConditionValue(value, field, meta?)` reads a row field or special `$key`/`$index`/`$mapKey` meta field.
- `readQueryConditionEqualityHint(conditions, field)` extracts equality/in hints for indexes.
- `normalizeQueryOperator(condition)` resolves operator aliases such as `==`, `gte`, and `<=`.
- `readQueryConditionExpected(condition, op)` reads the canonical expected value for a resolved operator.

### Entity Identity

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

## Benchmarks

Run the package-local benchmark:

```sh
npm run bench
```

Latest local package-gate run on Node v26.1.0, darwin arm64, 3 rounds:

| Fixture | Median | p95 |
| --- | ---: | ---: |
| Stable query key hash | 0.80 us | 0.81 us |
| Partial query key match | 0.06 us | 0.06 us |
| Condition match over row | 0.37 us | 0.37 us |
| Schema normalization | 0.48 us | 0.48 us |
| Entity identity read | 0.03 us | 0.03 us |

These are Frontier-only package measurements, not competitor comparisons.

## Verification

```sh
npm test
npm run fuzz
npm run bench
npm run pack:dry
```

## License

MIT. See [LICENSE](./LICENSE).
