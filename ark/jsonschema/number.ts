import { rootSchema, type Intersection } from "@ark/schema"
import { throwParseError } from "@ark/util"
import type { JsonSchema, Out, Type } from "arktype"
import { JsonSchemaScope } from "./scope.ts"

export const parseNumberJsonSchema: Type<
	(In: JsonSchema.Numeric) => Out<Type<number, any>>,
	any
> = JsonSchemaScope.NumberSchema.pipe((jsonSchema): Type<number> => {
	const arktypeNumberSchema: Intersection.Schema<number> = {
		domain: "number"
	}

	if ("maximum" in jsonSchema) {
		if ("exclusiveMaximum" in jsonSchema) {
			throwParseError(
				"Provided number JSON Schema cannot have 'maximum' and 'exclusiveMaximum"
			)
		}
		arktypeNumberSchema.max = jsonSchema.maximum
	} else if ("exclusiveMaximum" in jsonSchema) {
		arktypeNumberSchema.max = {
			rule: jsonSchema.exclusiveMaximum,
			exclusive: true
		}
	}

	if ("minimum" in jsonSchema) {
		if ("exclusiveMinimum" in jsonSchema) {
			throwParseError(
				"Provided number JSON Schema cannot have 'minimum' and 'exclusiveMinimum"
			)
		}
		arktypeNumberSchema.min = jsonSchema.minimum
	} else if ("exclusiveMinimum" in jsonSchema) {
		arktypeNumberSchema.min = {
			rule: jsonSchema.exclusiveMinimum,
			exclusive: true
		}
	}

	if ("multipleOf" in jsonSchema)
		arktypeNumberSchema.divisor = jsonSchema.multipleOf
	else if (jsonSchema.type === "integer") arktypeNumberSchema.divisor = 1

	return rootSchema(arktypeNumberSchema) as never
})
