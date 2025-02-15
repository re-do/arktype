import { throwParseError } from "@ark/util"
import { type JsonSchema, type Type, type } from "arktype"

export const parseCommonJsonSchema = (
	jsonSchema: JsonSchema
): Type | undefined => {
	if ("const" in jsonSchema) {
		if ("enum" in jsonSchema) {
			throwParseError(
				"Provided JSON Schema cannot have both 'const' and 'enum' keywords."
			)
		}
		return type.unit(jsonSchema.const)
	}

	if ("enum" in jsonSchema) return type.enumerated(jsonSchema.enum)
}
