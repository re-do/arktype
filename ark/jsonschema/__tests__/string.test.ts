import { attest, contextualize } from "@ark/attest"
import { parseJsonSchema } from "@ark/jsonschema"

// TODO: Add compound tests for strings (e.g. maxLength AND pattern)
// TODO: Add explicit test for negative length constraint failing (since explicitly mentioned in spec)

contextualize(() => {
	it("type string", () => {
		const t = parseJsonSchema({ type: "string" })
		attest(t.json).snap({ domain: "string" })
	})

	it("maxLength", () => {
		const tMaxLength = parseJsonSchema({
			type: "string",
			maxLength: 5
		})
		attest(tMaxLength.json).snap({
			domain: "string",
			maxLength: 5
		})
	})

	it("minLength", () => {
		const tMinLength = parseJsonSchema({
			type: "string",
			minLength: 5
		})
		attest(tMinLength.json).snap({
			domain: "string",
			minLength: 5
		})
	})

	it("pattern", () => {
		const tPatternString = parseJsonSchema({
			type: "string",
			pattern: "es"
		})
		attest(tPatternString.json).snap({
			domain: "string",
			pattern: ["es"]
		})
		// JSON Schema explicitly specifies that regexes MUST NOT be implicitly anchored
		// https://json-schema.org/draft-07/draft-handrews-json-schema-validation-01#rfc.section.4.3
		attest(tPatternString.allows("expression")).equals(true)

		const tPatternRegExp = parseJsonSchema({
			type: "string",
			pattern: /es/
		})
		attest(tPatternRegExp.json).snap({
			domain: "string",
			pattern: ["es"] // strips the outer slashes
		})
		attest(tPatternRegExp.allows("expression")).equals(true)
	})
})
