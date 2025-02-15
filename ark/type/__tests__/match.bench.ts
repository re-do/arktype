import { bench } from "@ark/attest"
import { match, type } from "arktype"

bench.baseline(() => {
	type("never")
	match.case("never", () => {}).default("assert")
	match({
		never: () => {},
		default: "assert"
	})
})

bench("case(3, define)", () =>
	match
		.case("-1", n => `${n}` as const)
		.case("-2", n => `${n}` as const)
		.case("-3", n => `${n}` as const)
		.default("assert")
).types([2523, "instantiations"])

bench("case(10, define)", () =>
	match
		.case("0", n => `${n}` as const)
		.case("1", n => `${n}` as const)
		.case("2", n => `${n}` as const)
		.case("3", n => `${n}` as const)
		.case("4", n => `${n}` as const)
		.case("5", n => `${n}` as const)
		.case("6", n => `${n}` as const)
		.case("7", n => `${n}` as const)
		.case("8", n => `${n}` as const)
		.case("9", n => `${n}` as const)
		.default("assert")
).types([9267, "instantiations"])

bench("match.in<t> cases define and invoke", () => {
	const matcher = match
		.in<string | number | boolean>()
		.case("string", s => s)
		.case("number", n => n)
		.case("boolean", b => b)
		.default("assert")

	const zero = matcher("abc")
	const one = matcher(4)
	const two = matcher(true)
	return [zero, one, two]
}).types([2931, "instantiations"])

bench("record(3, define)", () =>
	match({
		"20": n => `${n}` as const,
		"21": n => `${n}` as const,
		"22": n => `${n}` as const,
		default: "assert"
	})
).types([2090, "instantiations"])

bench("record(10, define)", () =>
	match({
		"-10n": n => `${n}` as const,
		"-1n": n => `${n}` as const,
		"-2n": n => `${n}` as const,
		"-3n": n => `${n}` as const,
		"-4n": n => `${n}` as const,
		"-5n": n => `${n}` as const,
		"-6n": n => `${n}` as const,
		"-7n": n => `${n}` as const,
		"-8n": n => `${n}` as const,
		"-9n": n => `${n}` as const,
		default: "assert"
	})
).types([7233, "instantiations"])

bench("record.in<t> define and invoke", () => {
	const matcher = match.in<string | number | boolean>().match({
		symbol: s => s,
		object: n => n,
		boolean: b => b,
		default: "assert"
	})

	const zero = matcher("abc")
	const one = matcher(4)
	const two = matcher(true)
	return [zero, one, two]
}).types([3329, "instantiations"])

// For some reason, these calls don't register instantiations
// will have to look into that later, although generally
// I'd expect the definition to be the more expensive API anyways

const invokedCases3 = match
	.case("31", n => `${n}` as const)
	.case("32", n => `${n}` as const)
	.case("33", n => `${n}` as const)
	.default("assert")

bench("case(3, invoke)", () => {
	invokedCases3(31)
	invokedCases3(32)
	invokedCases3(33)
}).types([0, "instantiations"])

const invokedCases10 = match
	.case("0n", n => `${n}` as const)
	.case("1n", n => `${n}` as const)
	.case("2n", n => `${n}` as const)
	.case("3n", n => `${n}` as const)
	.case("4n", n => `${n}` as const)
	.case("5n", n => `${n}` as const)
	.case("6n", n => `${n}` as const)
	.case("7n", n => `${n}` as const)
	.case("8n", n => `${n}` as const)
	.case("9n", n => `${n}` as const)
	.default("assert")

bench("case(10, invoke first)", () => {
	invokedCases10(0n)
	invokedCases10(1n)
	invokedCases10(2n)
}).types([0, "instantiations"])

bench("case(10, invoke last)", () => {
	invokedCases10(7n)
	invokedCases10(8n)
	invokedCases10(9n)
}).types([0, "instantiations"])
