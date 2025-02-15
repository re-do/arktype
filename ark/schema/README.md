# @ark/schema

Underlying schema language parsed from arktype syntax.

UNDER DEVELOPMENT

The parts of ArkType's type system that exist in TS (i.e. not runtime-only constraints like bounds, divisors, custom predicates, morphs etc.) are structured like this:

- Union: a set of intersections
- Intersection: a set of a basis and constraints
- Basis: this is the base type to which refinements like props are applied. It is one of three things, getting narrower as you move down the list:
  - Domain: `"string" | "number" | "bigint" | "object" | "symbol"` parallels builtin TS keywords for non-enumerable value sets
  - Proto: Must be an `instanceof` some class (implies domain `"object"`)
  - Unit: Must `===` some value (can be intersected with any other constraint and reduced to itself or a disjoint)
- Constraint: an individual condition that must be satisfied:
  - Required: must have a specified literal string or symbol key and a value that conforms to a specified union or intersection
  - Optional: Required conditions met or the specified key is not present
  - Index: all keys that satisfy an index type must have values satisfying the corresponding value type

In this system, `L` extends/subtypes/is assignable to `R` if and only if the intersection `L & R` is equal to `L`.
