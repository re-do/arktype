# @ark/jsonschema

## What is it?

@ark/jsonschema is a package that allows converting from a JSON Schema schema, to an ArkType type. For example:

```js
import { parseJsonSchema } from "@ark/jsonschema"

const t = parseJsonSchema({ type: "string", minLength: 5, maxLength: 10 })
```

is equivalent to:

```js
import { type } from "arktype"

const t = type("5<=string<=10")
```

This enables easy adoption of ArkType for people who currently have JSON Schema based runtime validation in their codebase.

Where possible, the library also has TypeScript type inference so that the runtime validation remains typesafe. Extending on the above example, this means that the return type of the below `parseString` function would be correctly inferred as `string`:

```ts
const assertIsString = (data: unknown)
    return t.assert(data)
```

## Extra Type Safety

If you wish to ensure that your JSON Schema schemas are valid, you can do this too! Simply import the relevant `Schema` type from `@ark/jsonschema` like so:

```ts
import type { JsonSchema } from "arktype"

const integerSchema: JsonSchema.Numeric = {
	type: "integer",
	multipleOf: "3" // errors stating that 'multipleOf' must be a number
}
```

Note that for string schemas exclusively, you must import the schema type from `@ark/jsonschema` instead of `arktype`. This is because `@ark/jsonschema` doesn't yet support the `format` keyword whilst `arktype` does.

```ts
import type { StringSchema } from "@ark/jsonschema"
const stringSchema: StringSchema = {
	type: "string",
	minLength: "3" // errors stating that 'minLength' must be a number
}
```
