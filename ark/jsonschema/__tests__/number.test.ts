import { attest, contextualize } from "@ark/attest"
import { parseJsonSchema } from "@ark/jsonschema"

// TODO: Compound tests for number (e.g. 'minimum' AND 'maximum')

contextualize(() => {
	it("type number", () => {
		const jsonSchema = { type: "number" } as const
		const expectedArkTypeSchema = { domain: "number" } as const

		const parsedNumberValidator = parseJsonSchema(jsonSchema)
		attest(parsedNumberValidator.json).snap(expectedArkTypeSchema)
	})

	it("type integer", () => {
		const t = parseJsonSchema({ type: "integer" })
		attest(t.json).snap({ domain: "number", divisor: 1 })
	})

	it("maximum & exclusiveMaximum", () => {
		const tMax = parseJsonSchema({
			type: "number",
			maximum: 5
		})
		attest(tMax.json).snap({
			domain: "number",
			max: 5
		})

		const tExclMax = parseJsonSchema({
			type: "number",
			exclusiveMaximum: 5
		})
		attest(tExclMax.json).snap({
			domain: "number",
			max: { rule: 5, exclusive: true }
		})

		attest(() =>
			parseJsonSchema({
				type: "number",
				maximum: 5,
				exclusiveMaximum: 5
			})
		).throws(
			"ParseError: Provided number JSON Schema cannot have 'maximum' and 'exclusiveMaximum"
		)
	})

	it("minimum & exclusiveMinimum", () => {
		const tMin = parseJsonSchema({ type: "number", minimum: 5 })
		attest(tMin.json).snap({ domain: "number", min: 5 })

		const tExclMin = parseJsonSchema({
			type: "number",
			exclusiveMinimum: 5
		})
		attest(tExclMin.json).snap({
			domain: "number",
			min: { rule: 5, exclusive: true }
		})

		attest(() =>
			parseJsonSchema({
				type: "number",
				minimum: 5,
				exclusiveMinimum: 5
			})
		).throws(
			"ParseError: Provided number JSON Schema cannot have 'minimum' and 'exclusiveMinimum"
		)
	})

	it("multipleOf", () => {
		const t = parseJsonSchema({ type: "number", multipleOf: 5 })
		attest(t.json).snap({ domain: "number", divisor: 5 })

		const tInt = parseJsonSchema({
			type: "integer",
			multipleOf: 5
		})
		attest(tInt.json).snap({ domain: "number", divisor: 5 })

		// JSON Schema allows decimal multipleOf, but ArkType doesn't.
		attest(() => parseJsonSchema({ type: "number", multipleOf: 5.5 })).throws(
			"AggregateError: multipleOf must be an integer"
		)
	})
})
