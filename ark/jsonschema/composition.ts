import { printable } from "@ark/util"
import { type, type JsonSchema, type Type } from "arktype"
import { parseJsonSchema } from "./json.ts"

const parseAllOfJsonSchema = (jsonSchemas: readonly JsonSchema[]): Type =>
	jsonSchemas
		.map(jsonSchema => parseJsonSchema(jsonSchema))
		.reduce((acc, validator) => acc.and(validator))

const parseAnyOfJsonSchema = (jsonSchemas: readonly JsonSchema[]): Type =>
	jsonSchemas
		.map(jsonSchema => parseJsonSchema(jsonSchema))
		.reduce((acc, validator) => acc.or(validator))

const parseNotJsonSchema = (jsonSchema: JsonSchema) => {
	const inner = parseJsonSchema(jsonSchema)
	return type.unknown.narrow((data, ctx) =>
		inner.allows(data) ?
			ctx.reject({
				expected: `a value that's not ${inner.description}`,
				actual: printable(data)
			})
		:	true
	) as Type
}

const parseOneOfJsonSchema = (jsonSchemas: readonly JsonSchema[]) => {
	const oneOfValidators = jsonSchemas.map(nestedSchema =>
		parseJsonSchema(nestedSchema)
	)
	const oneOfValidatorsDescriptions = oneOfValidators.map(
		validator => `○ ${validator.description}`
	)
	return type.unknown.narrow((data, ctx) => {
		let matchedValidator: Type | undefined = undefined

		for (const validator of oneOfValidators) {
			if (validator.allows(data)) {
				if (matchedValidator === undefined) {
					matchedValidator = validator
					continue
				}
				return ctx.reject({
					expected: `exactly one of:\n${oneOfValidatorsDescriptions.join("\n")}`,
					actual: printable(data)
				})
			}
		}
		return matchedValidator !== undefined
	})
}

export const parseCompositionJsonSchema = (
	jsonSchema: JsonSchema
): Type | undefined => {
	if ("allOf" in jsonSchema) return parseAllOfJsonSchema(jsonSchema.allOf)
	if ("anyOf" in jsonSchema) return parseAnyOfJsonSchema(jsonSchema.anyOf)
	if ("not" in jsonSchema) return parseNotJsonSchema(jsonSchema.not)
	if ("oneOf" in jsonSchema) return parseOneOfJsonSchema(jsonSchema.oneOf)
}
