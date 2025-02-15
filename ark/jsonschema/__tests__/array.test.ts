import { attest, contextualize } from "@ark/attest"
import { parseJsonSchema } from "@ark/jsonschema"

// TODO: Add compound tests for arrays (e.g. maxItems AND minItems )
// TODO: Add explicit test for negative length constraint failing (since explicitly mentioned in spec)

contextualize(() => {
	it("type array", () => {
		const t = parseJsonSchema({ type: "array" })
		attest(t.json).snap({ proto: "Array" })
	})

	it("items & prefixItems", () => {
		const tItems = parseJsonSchema({ type: "array", items: { type: "string" } })
		attest(tItems.json).snap({ proto: "Array", sequence: "string" })
		attest(tItems.allows(["foo"])).equals(true)
		attest(tItems.allows(["foo", "bar"])).equals(true)
		attest(tItems.allows(["foo", 3, "bar"])).equals(false)

		const tItemsArr = parseJsonSchema({
			type: "array",
			items: [{ type: "string" }, { type: "number" }]
		})
		attest(tItemsArr.json).snap({
			proto: "Array",
			sequence: { prefix: ["string", "number"] },
			exactLength: 2
		})
		attest(tItemsArr.allows(["foo", 1])).equals(true)
		attest(tItemsArr.allows([1, "foo"])).equals(false)
		attest(tItemsArr.allows(["foo", 1, true])).equals(false)

		const tPrefixItems = parseJsonSchema({
			type: "array",
			prefixItems: [{ type: "string" }, { type: "number" }]
		})
		attest(tPrefixItems.json).snap({
			proto: "Array",
			sequence: { prefix: ["string", "number"] },
			exactLength: 2
		})
	})

	it("additionalItems", () => {
		const tItemsVariadic = parseJsonSchema({
			type: "array",
			items: [{ type: "string" }, { type: "number" }],
			additionalItems: { type: "boolean" }
		})
		attest(tItemsVariadic.json).snap({
			minLength: 2,
			proto: "Array",
			sequence: {
				prefix: ["string", "number"],
				variadic: [{ unit: false }, { unit: true }]
			}
		})
		attest(tItemsVariadic.allows(["foo", 1])).equals(true)
		attest(tItemsVariadic.allows([1, "foo", true])).equals(false)
		attest(tItemsVariadic.allows([false, "foo", 1])).equals(false)
		attest(tItemsVariadic.allows(["foo", 1, true])).equals(true)
	})

	it("contains", () => {
		const tContains = parseJsonSchema({
			type: "array",
			contains: { type: "number" }
		})
		attest(tContains.json).snap({
			proto: "Array",
			predicate: ["$ark.jsonSchemaArrayContainsValidator"]
		})
		attest(tContains.allows([])).equals(false)
		attest(tContains.allows([1, 2, 3])).equals(true)
		attest(tContains.allows(["foo", "bar", "baz"])).equals(false)
	})

	it("maxItems", () => {
		const tMaxItems = parseJsonSchema({
			type: "array",
			maxItems: 5
		})
		attest(tMaxItems.json).snap({
			proto: "Array",
			maxLength: 5
		})

		attest(() => parseJsonSchema({ type: "array", maxItems: -1 })).throws(
			"maxItems must be non-negative"
		)
	})

	it("minItems", () => {
		const tMinItems = parseJsonSchema({
			type: "array",
			minItems: 5
		})
		attest(tMinItems.json).snap({
			proto: "Array",
			minLength: 5
		})

		attest(() => parseJsonSchema({ type: "array", minItems: -1 })).throws(
			"minItems must be non-negative"
		)
	})

	it("uniqueItems", () => {
		const tUniqueItems = parseJsonSchema({
			type: "array",
			uniqueItems: true
		})
		attest(tUniqueItems.json).snap({
			proto: "Array",
			predicate: ["$ark.jsonSchemaArrayUniqueItemsValidator"]
		})
		attest(tUniqueItems.allows([1, 2, 3])).equals(true)
		attest(tUniqueItems.allows([1, 1, 2])).equals(false)
		attest(
			tUniqueItems.allows([
				{ foo: { bar: ["baz", { qux: "quux" }] } },
				{ foo: { bar: ["baz", { qux: "quux" }] } }
			])
		).equals(false)
		attest(
			// JSON Schema specifies that arrays must be same order to be classified as equal
			tUniqueItems.allows([
				{ foo: { bar: ["baz", { qux: "quux" }] } },
				{ foo: { bar: [{ qux: "quux" }, "baz"] } }
			])
		).equals(true)
	})
})
