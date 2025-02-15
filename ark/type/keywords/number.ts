import { intrinsic, rootSchema } from "@ark/schema"
import type { Module, Submodule } from "../module.ts"
import { Scope } from "../scope.ts"

/**
 * As per the ECMA-262 specification:
 * A time value supports a slightly smaller range of -8,640,000,000,000,000 to 8,640,000,000,000,000 milliseconds.
 *
 * @see https://262.ecma-international.org/15.0/index.html#sec-time-values-and-time-range
 */

export const epoch = rootSchema({
	domain: {
		domain: "number",
		meta: "a number representing a Unix timestamp"
	},
	divisor: {
		rule: 1,
		meta: `an integer representing a Unix timestamp`
	},
	min: {
		rule: -8640000000000000,
		meta: `a Unix timestamp after -8640000000000000`
	},
	max: {
		rule: 8640000000000000,
		meta: "a Unix timestamp before 8640000000000000"
	},
	meta: "an integer representing a safe Unix timestamp"
})

export const integer = rootSchema({
	domain: "number",
	divisor: 1
})

export const number: number.module = Scope.module(
	{
		root: intrinsic.number,
		integer,
		epoch,
		safe: rootSchema({
			domain: {
				domain: "number",
				numberAllowsNaN: false
			},
			min: Number.MIN_SAFE_INTEGER,
			max: Number.MAX_SAFE_INTEGER
		}),
		NaN: ["===", Number.NaN],
		Infinity: ["===", Number.POSITIVE_INFINITY],
		NegativeInfinity: ["===", Number.NEGATIVE_INFINITY]
	},
	{
		name: "number"
	}
)

export declare namespace number {
	export type module = Module<submodule>

	export type submodule = Submodule<$>

	export type $ = {
		root: number
		epoch: number
		integer: number
		safe: number
		NaN: number
		Infinity: number
		NegativeInfinity: number
	}
}
