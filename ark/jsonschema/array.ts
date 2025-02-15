import {
	rootSchema,
	type Intersection,
	type Predicate,
	type Traversal
} from "@ark/schema"
import { printable } from "@ark/util"
import type { JsonSchema, Out, Type } from "arktype"
import { parseJsonSchema } from "./json.ts"
import { JsonSchemaScope } from "./scope.ts"

const deepNormalize = (data: unknown): unknown =>
	typeof data === "object" ?
		data === null ? null
		: Array.isArray(data) ? data.map(item => deepNormalize(item))
		: Object.fromEntries(
				Object.entries(data)
					.map(([k, v]) => [k, deepNormalize(v)] as const)
					.sort((l, r) => (l[0] > r[0] ? 1 : -1))
			)
	:	data

const jsonSchemaArrayUniqueItemsValidator = (
	array: readonly unknown[],
	ctx: Traversal
) => {
	const seen: Record<string, true> = {}
	const duplicates: unknown[] = []
	for (const item of array) {
		const stringified = JSON.stringify(deepNormalize(item))
		if (stringified in seen) duplicates.push(item)
		else seen[stringified] = true
	}
	return duplicates.length === 0 ?
			true
		:	ctx.reject({
				expected: "unique array items",
				actual: `duplicated at elements ${printable(duplicates)}`
			})
}

const arrayContainsItemMatchingSchema = (schema: Type) => {
	const jsonSchemaArrayContainsValidator = (
		array: readonly unknown[],
		ctx: Traversal
	) =>
		array.some(item => schema.allows(item)) === true ?
			true
		:	ctx.reject({
				expected: `an array containing at least one item matching 'contains' schema of ${schema.description}`,
				actual: printable(array)
			})

	return jsonSchemaArrayContainsValidator
}

export const parseArrayJsonSchema: Type<
	(In: JsonSchema.Array) => Out<Type<unknown[], {}>>,
	any
> = JsonSchemaScope.ArraySchema.pipe((jsonSchema, ctx) => {
	const arktypeArraySchema: Intersection.Schema<Array<unknown>> = {
		proto: "Array"
	}

	if ("prefixItems" in jsonSchema) {
		if ("items" in jsonSchema) {
			ctx.reject({
				expected: "a valid array JSON Schema",
				actual:
					"an array JSON Schema with mutually exclusive keys 'prefixItems' and 'items' specified"
			})
		} else jsonSchema.items = jsonSchema.prefixItems
	}

	if ("items" in jsonSchema) {
		if (Array.isArray(jsonSchema.items)) {
			arktypeArraySchema.sequence = {
				prefix: jsonSchema.items.map(item => parseJsonSchema(item).internal)
			}

			if ("additionalItems" in jsonSchema) {
				if (jsonSchema.additionalItems === false)
					arktypeArraySchema.exactLength = jsonSchema.items.length
				else {
					arktypeArraySchema.sequence = {
						...arktypeArraySchema.sequence,
						variadic: parseJsonSchema(jsonSchema.additionalItems).internal
					}
				}
			}
		} else {
			arktypeArraySchema.sequence = {
				variadic: parseJsonSchema(jsonSchema.items).internal
			}
		}
	}

	if ("maxItems" in jsonSchema)
		arktypeArraySchema.maxLength = jsonSchema.maxItems
	if ("minItems" in jsonSchema)
		arktypeArraySchema.minLength = jsonSchema.minItems

	const predicates: Predicate.Schema[] = []
	if ("uniqueItems" in jsonSchema && jsonSchema.uniqueItems === true)
		predicates.push(jsonSchemaArrayUniqueItemsValidator)

	if ("contains" in jsonSchema) {
		const parsedContainsJsonSchema = parseJsonSchema(jsonSchema.contains)
		predicates.push(arrayContainsItemMatchingSchema(parsedContainsJsonSchema))
	}

	arktypeArraySchema.predicate = predicates

	return rootSchema(arktypeArraySchema) as never
})
