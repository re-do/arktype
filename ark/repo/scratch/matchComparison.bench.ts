import { bench } from "@ark/attest"
import { match } from "arktype"
import { match as tsMatch } from "ts-pattern"

const invokedCases3 = match
	.case("31", n => `${n}` as const)
	.case("32", n => `${n}` as const)
	.case("33", n => `${n}` as const)
	.default("assert")

const tsMatch3 = (n: 31 | 32 | 33) =>
	tsMatch(n)
		.with(31, n => `${n}`)
		.with(32, n => `${n}`)
		.with(33, n => `${n}`)
		.exhaustive()

bench("case(3, invoke)", () => {
	invokedCases3(31)
	invokedCases3(32)
	invokedCases3(33)
}).mean([832.71, "ns"])

bench("ts-pattern case(3, invoke)", () => {
	tsMatch3(31)
	tsMatch3(32)
	tsMatch3(33)
}).mean([384.92, "ns"])

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
	.default("never")

const tsMatch10 = (n: typeof invokedCases10.inferIn) =>
	tsMatch(n)
		.with(0n, n => `${n}`)
		.with(1n, n => `${n}`)
		.with(2n, n => `${n}`)
		.with(3n, n => `${n}`)
		.with(4n, n => `${n}`)
		.with(5n, n => `${n}`)
		.with(6n, n => `${n}`)
		.with(7n, n => `${n}`)
		.with(8n, n => `${n}`)
		.with(9n, n => `${n}`)
		.exhaustive()

bench("case(10, invoke first)", () => {
	invokedCases10(0n)
	invokedCases10(1n)
	invokedCases10(2n)
}).mean([892.59, "ns"])

bench("ts-pattern case(10, invoke first)", () => {
	tsMatch10(0n)
	tsMatch10(1n)
	tsMatch10(2n)
}).mean([796.69, "ns"])

bench("case(10, invoke last)", () => {
	invokedCases10(7n)
	invokedCases10(8n)
	invokedCases10(9n)
}).mean([977.74, "ns"])

bench("ts-pattern case(10, invoke last)", () => {
	tsMatch10(7n)
	tsMatch10(8n)
	tsMatch10(9n)
}).mean([1.63, "us"])
