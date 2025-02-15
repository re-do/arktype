import type { JsonSchemaOrBoolean } from "@ark/schema"
import { printable, throwParseError } from "@ark/util"
import { type, type JsonSchema } from "arktype"
import { parseCommonJsonSchema } from "./any.ts"
import { parseArrayJsonSchema } from "./array.ts"
import { parseCompositionJsonSchema } from "./composition.ts"
import { parseNumberJsonSchema } from "./number.ts"
import { parseObjectJsonSchema } from "./object.ts"
import { JsonSchemaScope } from "./scope.ts"
import { parseStringJsonSchema } from "./string.ts"

export const innerParseJsonSchema = JsonSchemaScope.Schema.pipe(
	(jsonSchema: JsonSchemaOrBoolean): type.Any => {
		if (typeof jsonSchema === "boolean") {
			if (jsonSchema) return JsonSchemaScope.Json
			else return type.never // No runtime value ever passes validation for JSON schema of 'false'
		}

		if (Array.isArray(jsonSchema)) {
			return (
				parseCompositionJsonSchema({ anyOf: jsonSchema }) ??
				throwParseError(
					"Failed to convert root array of JSON Schemas to an anyOf schema"
				)
			)
		}

		const constAndOrEnumValidator = parseCommonJsonSchema(
			jsonSchema as JsonSchema
		)
		const compositionValidator = parseCompositionJsonSchema(
			jsonSchema as JsonSchema
		)

		const preTypeValidator: type.Any | undefined =
			constAndOrEnumValidator ?
				compositionValidator ? compositionValidator.and(constAndOrEnumValidator)
				:	constAndOrEnumValidator
			:	compositionValidator

		if ("type" in jsonSchema) {
			let typeValidator: type.Any

			if (Array.isArray(jsonSchema.type)) {
				typeValidator =
					parseCompositionJsonSchema({
						anyOf: jsonSchema.type.map(t => ({ type: t }))
					}) ??
					throwParseError(
						"Failed to convert array of JSON Schemas types to an anyOf schema"
					)
			} else {
				const jsonSchemaType = jsonSchema.type as JsonSchema.TypeName
				switch (jsonSchemaType) {
					case "array":
						typeValidator = parseArrayJsonSchema.assert(jsonSchema)
						break
					case "boolean":
					case "null":
						typeValidator = type(jsonSchemaType)
						break
					case "integer":
					case "number":
						typeValidator = parseNumberJsonSchema.assert(jsonSchema)
						break
					case "object":
						typeValidator = parseObjectJsonSchema.assert(jsonSchema)
						break
					case "string":
						typeValidator = parseStringJsonSchema.assert(jsonSchema)
						break
					default:
						throwParseError(
							`Provided 'type' value must be a supported JSON Schema type (was '${jsonSchemaType}')`
						)
				}
			}
			if (preTypeValidator === undefined) return typeValidator
			return typeValidator.and(preTypeValidator)
		}
		if (preTypeValidator === undefined) {
			throwParseError(
				`Provided JSON Schema must have one of 'type', 'enum', 'const', 'allOf', 'anyOf' but was ${printable(jsonSchema)}.`
			)
		}
		return preTypeValidator
	}
)

export const parseJsonSchema = (jsonSchema: JsonSchemaOrBoolean): type.Any =>
	innerParseJsonSchema.assert(jsonSchema) as never
