import type { JsonSchemaOrBoolean } from "@ark/schema"
import { type JsonSchema, scope, type Scope } from "arktype"

type AnyKeywords = Partial<JsonSchema.Const & JsonSchema.Enum>

type TypeWithNoKeywords = { type: "boolean" | "null" }
type TypeWithKeywords =
	| JsonSchema.Array
	| JsonSchema.Numeric
	| JsonSchema.Object
	| StringSchema
// NB: For sake of simplicitly, at runtime it's assumed that
// whatever we're parsing is valid JSON since it will be 99% of the time.
// This decision may be changed later, e.g. when a built-in JSON type exists in AT.
type Json = unknown

type ArraySchema = JsonSchema.Array

type NumberSchema = JsonSchema.Numeric

type ObjectSchema = JsonSchema.Object

// NB: @ark/jsonschema doesn't support the "format" keyword, and the "pattern" could be string|RegExp rather than only string, so we need a separate type
export type StringSchema = Omit<JsonSchema.String, "format" | "pattern"> & {
	pattern?: string | RegExp
}

type JsonSchemaScope = Scope<{
	AnyKeywords: AnyKeywords
	CompositionKeywords: JsonSchema.Composition
	TypeWithNoKeywords: TypeWithNoKeywords
	TypeWithKeywords: TypeWithKeywords
	Json: Json
	Schema: JsonSchemaOrBoolean
	ArraySchema: ArraySchema
	NumberSchema: NumberSchema
	ObjectSchema: ObjectSchema
	StringSchema: StringSchema
}>

const $: JsonSchemaScope = scope(
	{
		AnyKeywords: {
			"const?": "unknown",
			"enum?": "unknown[]"
		},
		CompositionKeywords: {
			"allOf?": "Schema[]",
			"anyOf?": "Schema[]",
			"oneOf?": "Schema[]",
			"not?": "Schema"
		},
		TypeWithNoKeywords: { type: "'boolean'|'null'" },
		TypeWithKeywords: "ArraySchema|NumberSchema|ObjectSchema|StringSchema",
		// NB: For sake of simplicitly, at runtime it's assumed that
		// whatever we're parsing is valid JSON since it will be 99% of the time.
		// This decision may be changed later, e.g. when a built-in JSON type exists in AT.
		Json: "unknown",
		"#BaseSchema":
			// NB: `true` means "accept an valid JSON"; `false` means "reject everything".
			"boolean|TypeWithNoKeywords|TypeWithKeywords|AnyKeywords|CompositionKeywords",
		Schema: "BaseSchema|BaseSchema[]",
		ArraySchema: {
			"additionalItems?": "Schema",
			"contains?": "Schema",
			// JSON Schema states that if 'items' is not present, then treat as an empty schema (i.e. accept any valid JSON)
			"items?": "Schema|Schema[]",
			"maxItems?": "number.integer>=0",
			"minItems?": "number.integer>=0",
			// NB: Technically `prefixItems` and `items` are mutually exclusive,
			// which is reflected at runtime but it's not worth the performance cost to validate this statically.
			"prefixItems?": "Schema[]",
			type: "'array'",
			"uniqueItems?": "boolean"
		},
		NumberSchema: {
			// NB: Technically 'exclusiveMaximum' and 'exclusiveMinimum' are mutually exclusive with 'maximum' and 'minimum', respectively,
			// which is reflected at runtime but it's not worth the performance cost to validate this statically.
			"exclusiveMaximum?": "number",
			"exclusiveMinimum?": "number",
			"maximum?": "number",
			"minimum?": "number",
			// NB: JSON Schema allows decimal multipleOf, but ArkType only supports integer.
			"multipleOf?": "number.integer",
			type: "'number'|'integer'"
		},
		ObjectSchema: {
			"additionalProperties?": "Schema",
			"maxProperties?": "number.integer>=0",
			"minProperties?": "number.integer>=0",
			"patternProperties?": { "[string]": "Schema" },
			// NB: Technically 'properties' is required when 'required' is present,
			// which is reflected at runtime but it's not worth the performance cost to validate this statically.
			"properties?": { "[string]": "Schema" },
			"propertyNames?": "Schema",
			"required?": "string[]",
			type: "'object'"
		},
		StringSchema: {
			"maxLength?": "number.integer>=0",
			"minLength?": "number.integer>=0",
			"pattern?": "RegExp | string",
			type: "'string'"
		}
	},
	{ jitless: true } // workaround for https://github.com/arktypeio/arktype/issues/1188
) as unknown as JsonSchemaScope
export const JsonSchemaScope = $.export()
