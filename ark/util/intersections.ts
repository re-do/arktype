import type { array } from "./arrays.ts"
import type { domainOf } from "./domain.ts"
import type { andPreserveUnknown } from "./generics.ts"
import type { Hkt } from "./hkt.ts"
import type { propValueOf, requiredKeyOf } from "./records.ts"

export interface AndPreserveUnknown extends Hkt<[unknown, unknown]> {
	body: andPreserveUnknown<this[0], this[1]>
}

type SequenceIntersectionKind = "array" | "parameters"

export type intersectArrays<
	l extends array,
	r extends array,
	operator extends Hkt = AndPreserveUnknown
> = intersectSequences<l, r, [], [], operator, "array">

export type intersectParameters<
	l extends array,
	r extends array,
	operator extends Hkt = AndPreserveUnknown
> = intersectSequences<l, r, [], [], operator, "parameters">

type intersectSequences<
	l extends array,
	r extends array,
	acc extends array,
	postfix extends array,
	operation extends Hkt,
	kind extends SequenceIntersectionKind
> =
	l extends readonly [] ?
		// a longer array is assignable to a shorter one when treated as
		// parameters, but not when treated as a tuple
		kind extends "array" ?
			[] extends r ?
				[...acc, ...postfix]
			:	never
		:	[...acc, ...r, ...postfix]
	: r extends readonly [] ?
		kind extends "array" ?
			[] extends l ?
				[...acc, ...postfix]
			:	never
		:	[...acc, ...l, ...postfix]
	: // credit to @alexandroppolus for this part of the implementation
	// https://github.com/type-challenges/type-challenges/issues/33210
	[l, r] extends (
		[
			readonly [(infer lHead)?, ...infer lTail],
			readonly [(infer rHead)?, ...infer rTail]
		]
	) ?
		// if either operand has a non-variadic element at index 0
		// and both operands do not have postfix elements
		// (which causes the inferred head to widen to unknown)
		["0", lHead, rHead] extends [keyof l | keyof r, l[0], r[0]] ?
			intersectSequences<
				lTail,
				rTail,
				[[], []] extends [l, r] ?
					[...acc, Hkt.apply<operation, [lHead, rHead]>?]
				:	[...acc, Hkt.apply<operation, [lHead, rHead]>],
				postfix,
				operation,
				kind
			>
		: l extends readonly [...infer lInit, infer lLast] ?
			r extends readonly [...infer rInit, infer rLast] ?
				intersectSequences<
					lInit,
					rInit,
					acc,
					[Hkt.apply<operation, [lLast, rLast]>, ...postfix],
					operation,
					kind
				>
			:	intersectSequences<
					lInit,
					r,
					acc,
					[Hkt.apply<operation, [lLast, r[number]]>, ...postfix],
					operation,
					kind
				>
		: r extends readonly [...infer rInit, infer rLast] ?
			intersectSequences<
				l,
				rInit,
				acc,
				[Hkt.apply<operation, [l[number], rLast]>, ...postfix],
				operation,
				kind
			>
		:	[...acc, ...Hkt.apply<operation, [lHead, rHead]>[], ...postfix]
	:	never

export type isDisjoint<l, r> = overlaps<l, r> extends true ? false : true

export type overlaps<l, r> =
	l & r extends never ? false
	: domainOf<l> & domainOf<r> extends never ? false
	: [l, r] extends [object, object] ?
		false extends (
			propValueOf<{
				[k in Extract<
					keyof l & keyof r,
					requiredKeyOf<l> | requiredKeyOf<r>
				>]: overlaps<l[k], r[k]>
			}>
		) ?
			false
		:	true
	:	true
