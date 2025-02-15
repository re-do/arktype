import { attest, contextualize } from "@ark/attest"
import { parseJsonSchema } from "@ark/jsonschema"

// TODO: Add compound tests for objects (e.g. 'maxProperties' AND 'minProperties')
// TODO: Add tests for propertyNames

contextualize(() => {
	it("type object", () => {
		const t = parseJsonSchema({ type: "object" })
		attest(t.json).snap({ domain: "object" })
	})

	it("maxProperties", () => {
		const tMaxProperties = parseJsonSchema({
			type: "object",
			maxProperties: 1
		})
		attest(tMaxProperties.json).snap({
			domain: "object",
			predicate: ["$ark.jsonSchemaObjectMaxPropertiesValidator"]
		})
		attest(tMaxProperties.allows({})).equals(true)
		attest(tMaxProperties.allows({ foo: 1 })).equals(true)
		attest(tMaxProperties.allows({ foo: 1, bar: 2 })).equals(false)
		attest(tMaxProperties.allows({ foo: 1, bar: 2, baz: 3 })).equals(false)
	})

	it("minProperties", () => {
		const tMinProperties = parseJsonSchema({
			type: "object",
			minProperties: 2
		})
		attest(tMinProperties.json).snap({
			domain: "object",
			predicate: ["$ark.jsonSchemaObjectMinPropertiesValidator"]
		})
		attest(tMinProperties.allows({})).equals(false)
		attest(tMinProperties.allows({ foo: 1 })).equals(false)
		attest(tMinProperties.allows({ foo: 1, bar: 2 })).equals(true)
		attest(tMinProperties.allows({ foo: 1, bar: 2, baz: 3 })).equals(true)
	})

	it("properties & required", () => {
		const tRequired = parseJsonSchema({
			type: "object",
			properties: {
				foo: { type: "string" },
				bar: { type: "number" }
			},
			required: ["foo"]
		})
		attest(tRequired.json).snap({
			domain: "object",
			required: [{ key: "foo", value: "string" }],
			optional: [{ key: "bar", value: "number" }]
		})

		attest(() => parseJsonSchema({ type: "object", required: ["foo"] })).throws(
			"AggregateError: must be a valid object JSON Schema (was an object JSON Schema with 'required' array but no 'properties' object)"
		)
		attest(() =>
			parseJsonSchema({
				type: "object",
				properties: { foo: { type: "string" } },
				required: ["bar"]
			})
		).throws(
			`AggregateError: required must be a key from the 'properties' object (one of ["foo"]) (was bar)`
		)
		attest(() =>
			parseJsonSchema({
				type: "object",
				properties: { foo: { type: "string" } },
				required: ["foo", "foo"]
			})
		).throws(
			`AggregateError: required must be an array of unique strings (was an array with the following duplicates: [{"element":"foo","indices":[1]}])`
		)
	})

	it("additionalProperties", () => {
		const tAdditionalProperties = parseJsonSchema({
			type: "object",
			additionalProperties: { type: "number" }
		})
		attest(tAdditionalProperties.json).snap({
			domain: "object",
			predicate: ["$ark.jsonSchemaObjectAdditionalPropertiesValidator"]
		})
		attest(tAdditionalProperties.allows({})).equals(true)
		attest(tAdditionalProperties.allows({ foo: 1 })).equals(true)
		attest(tAdditionalProperties.allows({ foo: 1, bar: 2 })).equals(true)
		attest(tAdditionalProperties.allows({ foo: 1, bar: "2" })).equals(false)
	})

	it("patternProperties", () => {
		const tPatternProperties = parseJsonSchema({
			type: "object",
			patternProperties: {
				"^[a-z]+$": { type: "string" }
			}
		})
		attest(tPatternProperties.json).snap({
			domain: "object",
			index: [
				{
					signature: { domain: "string", pattern: ["^[a-z]+$"] },
					value: "string"
				}
			]
		})
		attest(tPatternProperties.allows({})).equals(true)
		attest(tPatternProperties.allows({ foo: "bar" })).equals(true)
		attest(tPatternProperties.allows({ foo: 1 })).equals(false)
		attest(tPatternProperties.allows({ "123": "bar" })).equals(true) // true since allows additional properties
	})
})
