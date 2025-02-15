import { bench } from "@ark/attest"
import { type } from "arktype"

bench.baseline(() => {
	type({
		_: "symbol[]",
		__: { ___: "symbol[]" }
	})

	type(["symbol[]", "symbol[]", ["symbol[]"]])
})

bench("object literal", () =>
	type({
		a: "string[]",
		b: "number[]",
		c: { nested: "boolean[]" }
	})
).types([2387, "instantiations"])

bench("object literal with optional keys", () =>
	type({
		"a?": "string[]",
		"b?": "number[]",
		"c?": { "nested?": "boolean[]" }
	})
).types([2266, "instantiations"])

bench("tuple", () => type(["string[]", "number[]", ["boolean[]"]])).types([
	3010,
	"instantiations"
])

bench("inline definition", () =>
	type({
		a: "string"
	})
).types([892, "instantiations"])

bench("referenced type", () => {
	const a = type("string")
	return type({
		a
	})
}).types([3391, "instantiations"])

// https://github.com/arktypeio/arktype/issues/787
bench("inline reference", () =>
	type({
		a: type("string")
	})
).types([3407, "instantiations"])

bench("nested type invocations", () =>
	type({
		foo: type({
			bar: type({
				zoo: "string[]"
			})
				.array()
				.or("number"),
			superBar: type([
				type("string"),
				type("number[]"),
				type({ inner: type("boolean") })
			])
		})
			.or({
				baz: "string",
				quux: "1 | 2 | 3"
			})
			.array()
	})
).types([15018, "instantiations"])
