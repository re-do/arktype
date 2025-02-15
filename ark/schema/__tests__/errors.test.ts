import { attest, contextualize } from "@ark/attest"
import {
	$ark,
	configureSchema,
	rootSchema,
	schemaScope,
	type ArkErrors
} from "@ark/schema"

contextualize(() => {
	it("shallow", () => {
		const n = rootSchema({
			domain: "number",
			divisor: 3
		})
		attest(n.traverse(6)).snap(6)
		attest(n.traverse(7)?.toString()).snap("must be a multiple of 3 (was 7)")
	})

	it("at path", () => {
		const o = rootSchema({
			domain: "object",
			required: {
				key: "foo",
				value: {
					domain: "number",
					divisor: 3
				}
			}
		})
		attest(o.traverse({ foo: 6 })).snap({ foo: 6 })
		attest(o.traverse({ foo: 7 })?.toString()).snap(
			"foo must be a multiple of 3 (was 7)"
		)
	})

	it("array", () => {
		const t = rootSchema({
			proto: Array,
			sequence: "number"
		})
		attest(t.traverse([5])).snap([5])
		attest(t.traverse([5, "five"])?.toString()).snap(
			"value at [1] must be a number (was a string)"
		)
	})

	it("custom description integrated with error", () => {
		const superSpecialBigint = rootSchema({
			domain: "bigint",
			meta: "my special bigint"
		})
		attest(superSpecialBigint.description).snap("my special bigint")
		attest(superSpecialBigint.traverse(5)?.toString()).snap(
			"must be my special bigint (was a number)"
		)
	})

	it("custom description on parent doesn't affect children", () => {
		const evenNumber = rootSchema({
			meta: "an even number",
			domain: "number",
			divisor: 2
		})
		attest(evenNumber.description).snap("an even number")
		// since the error is from the divisor constraint which didn't have a
		// description, it is unchanged
		attest(evenNumber.traverse(5)?.toString()).snap("must be even (was 5)")
	})

	it("can configure error writers at a node level", () => {
		const customNumber = rootSchema({
			meta: {
				description: "custom description",
				actual: data => `custom actual ${data}`,
				problem: ctx => `custom problem ${ctx.expected} ${ctx.actual}`,
				message: ctx => `custom message ${ctx.problem}`
			},
			domain: "number"
		})

		const out = customNumber("foo") as ArkErrors

		attest(out.summary).snap(
			"custom message custom problem custom description custom actual foo"
		)
	})

	it("can configure errors by kind at a scope level", () => {
		const types = schemaScope(
			{ superSpecialString: "string" },
			{
				domain: {
					expected: inner => `custom expected ${inner.domain}`,
					actual: data => `custom actual ${data}`,
					problem: ctx => `custom problem ${ctx.expected} ${ctx.actual}`,
					message: ctx => `custom message ${ctx.problem}`
				}
			}
		).export()
		const superSpecialString = types.superSpecialString
		attest(superSpecialString(5)?.toString()).snap(
			"custom message custom problem custom expected string custom actual 5"
		)
	})

	it("can configure description by kind at scope level", () => {
		const types = schemaScope(
			{ superSpecialNumber: "number" },
			{
				domain: {
					description: inner => `my special ${inner.domain}`
				}
			}
		).export()
		const superSpecialNumber = types.superSpecialNumber
		attest(superSpecialNumber.description).snap("my special number")
		attest(superSpecialNumber("five")?.toString()).snap(
			"must be my special number (was a string)"
		)
	})

	it("can apply a global config", () => {
		configureSchema({
			domain: {
				description: inner => `my special ${inner.domain}`
			}
		})
		const mySpecialSymbol = schemaScope({}).parseSchema("symbol")
		attest(mySpecialSymbol.traverse("foo")?.toString()).snap(
			"must be my special symbol (was a string)"
		)
		configureSchema({
			domain: $ark.defaultConfig.domain
		})
		const myBoringSymbol = schemaScope({}).parseSchema("symbol")
		attest(myBoringSymbol.traverse("foo")?.toString()).snap(
			"must be a symbol (was a string)"
		)
	})
})
