import type { array } from "./arrays.ts"
import { noSuggest } from "./errors.ts"
import { flatMorph } from "./flatMorph.ts"
import type { Fn } from "./functions.ts"
import type { defined, show } from "./generics.ts"
import type { Key } from "./keys.ts"
import type { intersectUnion } from "./unionToTuple.ts"

export type Dict<k extends string = string, v = unknown> = {
	readonly [_ in k]: v
}

export type dict<v = unknown, k extends string = string> = {
	[_ in k]: v
}

/** Either:
 * A, with all properties of B undefined
 * OR
 * B, with all properties of A undefined
 **/
export type propwiseXor<a, b> =
	| show<a & { [k in keyof b]?: undefined }>
	| show<b & { [k in keyof a]?: undefined }>

export type unionToPropwiseXor<
	props extends object,
	branchKey extends PropertyKey = keyof intersectUnion<props>
> =
	props extends infer distributed ?
		show<
			distributed & {
				// ensure keys not present on the current branch are undefined
				[k in branchKey]?: k extends keyof distributed ? unknown : undefined
			}
		>
	:	never

export type requireKeys<o, key extends keyof o> = o & {
	[requiredKey in key]-?: defined<o[requiredKey]>
}

export type require<o, maxDepth extends number = 1> = _require<o, [], maxDepth>

type _require<o, depth extends 1[], maxDepth extends number> =
	depth["length"] extends maxDepth ? o
	: o extends object ?
		o extends Fn ?
			o
		:	{
				[k in keyof o]-?: _require<o[k], [...depth, 1], maxDepth>
			}
	:	o

export type PartialRecord<k extends PropertyKey = PropertyKey, v = unknown> = {
	[_ in k]?: v
}

/** Returns true if a type can be homomorphically mapped without losing information.
 * Useful for avoiding e.g. classes with private properties while mapping.
 */
export type isSafelyMappable<t> =
	{ [k in keyof t]: t[k] } extends t ? true : false

export type KeySet<key extends string = string> = { readonly [_ in key]?: 1 }

export type keySetOf<o extends object> = KeySet<Extract<keyof o, string>>

export type mutable<o, maxDepth extends number = 1> = _mutable<o, [], maxDepth>

type _mutable<o, depth extends 1[], maxDepth extends number> =
	depth["length"] extends maxDepth ? o
	: o extends object ?
		o extends Fn ?
			o
		:	{
				-readonly [k in keyof o]: _mutable<o[k], [...depth, 1], maxDepth>
			}
	:	o

/**
 * extracts entries mimicking Object.entries, accounting for whether the
 * object is an array
 **/
export type entryOf<o> = {
	[k in keyof o]-?: [k, o[k] & ({} | null)]
}[o extends readonly unknown[] ? keyof o & number : keyof o] &
	unknown

export type entriesOf<o extends object> = entryOf<o>[]

/**
 * Object.entries wrapper providing narrowed types for objects with known sets
 * of keys, e.g. those defined internally as configs
 */
export const entriesOf: <o extends object>(o: o) => entryOf<o>[] =
	Object.entries as never

export type Entry<
	key extends PropertyKey = PropertyKey,
	value = unknown
> = readonly [key: key, value: value]

export type fromEntries<entries extends readonly Entry[]> = show<{
	[entry in entries[number] as entry[0]]: entry[1]
}>

export const fromEntries = <const entries extends readonly Entry[]>(
	entries: entries
): fromEntries<entries> => Object.fromEntries(entries) as never

/** Mimics the result of Object.keys(...) */
export type keyOf<o> =
	o extends array ?
		number extends o["length"] ?
			`${number}`
		:	keyof o & `${number}`
	: keyof o extends infer k ?
		k extends string ? k
		: k extends number ? `${k}`
		: never
	:	never

export const keysOf = <o extends object>(o: o): keyOf<o>[] =>
	Object.keys(o) as never

export const isKeyOf = <k extends string | number | symbol, o extends object>(
	k: k,
	o: o
): k is Extract<keyof o, k> => k in o

/** Coalesce keys that exist on one or more branches of a union */
export type unionKeyOf<t> = t extends unknown ? keyof t : never

export type extractKeyed<o extends object, k extends unionKeyOf<o>> = Extract<
	o,
	{ [_ in k]?: unknown }
>

export const hasKey = <o extends object, k extends unionKeyOf<o>>(
	o: o,
	k: k
): o is extractKeyed<o, k> => k in o

export type extractDefinedKey<o extends object, k extends unionKeyOf<o>> = show<
	extractKeyed<o, k> & { [_ in k]: {} | null }
>

// must be defined this way to avoid https://github.com/microsoft/TypeScript/issues/55049
export const hasDefinedKey: <o extends object, k extends unionKeyOf<o>>(
	o: o,
	k: k
) => o is extractDefinedKey<o, k> = (o, k): o is any =>
	(o as any)[k] !== undefined

export type requiredKeyOf<o> =
	keyof o extends infer k ?
		k extends keyof o ?
			o extends { [_ in k]-?: o[k] } ?
				k
			:	never
		:	never
	:	never

export type optionalKeyOf<o> = Exclude<keyof o, requiredKeyOf<o>>

export type merge<base, props> =
	base extends unknown ?
		props extends unknown ?
			show<omit<base, keyof props & keyof base> & props>
		:	never
	:	never

export type mergeExact<base, props> =
	base extends unknown ?
		props extends unknown ?
			show<omitMerged<base, props> & props>
		:	never
	:	never

type omitMerged<base, props> = {
	[k in keyof base as excludeExactKeyOf<k, props>]: base[k]
}

type excludeExactKeyOf<key extends PropertyKey, o> = Exclude<
	key,
	extractExactKeyOf<key, o>
>

// we can't use the normal method to distrubte over the keys
// since we need to preserve index signatures + literals
// like string | "foo" that would collapse in a union
type extractExactKeyOf<key extends PropertyKey, base> = keyof {
	[k in keyof base as [key, k] extends [k, key] ? key : never]: 1
}

export type override<
	base,
	merged extends { [k in keyof base]?: unknown }
> = merge<base, merged>

export type propValueOf<o> = o[keyof o]

export const InnerDynamicBase = class {} as new <t extends object>(base: t) => t

/** @ts-ignore (needed to extend `t`) **/
export interface DynamicBase<t extends object> extends t {}
export class DynamicBase<t extends object> {
	constructor(properties: t) {
		Object.assign(this, properties)
	}
}

export const NoopBase = class {} as new <t extends object>() => t

/** @ts-ignore (needed to extend `t`) **/
export class CastableBase<t extends object> extends NoopBase<t> {}

export const splitByKeys = <o extends object, leftKeys extends keySetOf<o>>(
	o: o,
	leftKeys: leftKeys
): [
	show<Pick<o, keyof leftKeys & keyof o>>,
	show<Omit<o, keyof leftKeys & keyof o>>
] => {
	const l: any = {}
	const r: any = {}
	let k: keyof o
	for (k in o) {
		if (k in leftKeys) l[k] = o[k]
		else r[k] = o[k]
	}
	return [l, r]
}

/** Homomorphic implementation of the builtin Pick.
 *
 * Gives different results for certain union expressions like the following:
 *
 * @example
 * // flattens result to { a?: 1 | 2; b?: 1 | 2 }
 * type PickResult = Pick<{ a: 1; b?: 1 } | { a?: 2; b: 2 }, "a" | "b">
 *
 * @example
 * // preserves original type w/ modifier groupings
 * type pickResult = pick<{ a: 1; b?: 1 } | { a?: 2; b: 2 }, "a" | "b">
 */
export type pick<o, key extends keyof o> =
	o extends unknown ?
		{
			[k in keyof o as k extends key ? k : never]: o[k]
		}
	:	// could also consider adding the following to extract literal keys from
		// index signatures as optional. doesn't match existing TS behavior though:
		//  & { [k in keyof o as key extends k ? key : never]?: o[k] }
		never

export const pick = <o extends object, keys extends keySetOf<o>>(
	o: o,
	keys: keys
): pick<o, keyof keys & keyof o> => splitByKeys(o, keys)[0] as never

/** Homomorphic implementation of the builtin Omit.
 *
 * Gives different results for many union expressions like the following:
 *
 * @example
 * // {}
 * type OmitResult = Omit<{ a: 1 } | { b: 2 }, never>
 *
 * @example
 * // preserves original type w/ modifier groupings
 * type omitResult = omit<{ a: 1 } | { b: 2 }, never>
 */
export type omit<o, key extends keyof o> = {
	[k in keyof o as k extends key ? never : k]: o[k]
}

export const omit = <o extends object, keys extends keySetOf<o>>(
	o: o,
	keys: keys
): omit<o, keyof keys & keyof o> => splitByKeys(o, keys)[1] as never

/** Returns onTrue if the type is exactly `{}` and onFalse otherwise*/
export type ifEmptyObjectLiteral<t, onTrue = true, onFalse = false> =
	[unknown, t & (null | undefined)] extends [t | null | undefined, never] ?
		onTrue
	:	onFalse

export type EmptyObject = Record<PropertyKey, never>

export const isEmptyObject = (o: object): o is EmptyObject =>
	Object.keys(o).length === 0

export const stringAndSymbolicEntriesOf = (o: object): Entry<Key>[] => [
	...Object.entries(o),
	...Object.getOwnPropertySymbols(o).map(k => [k, (o as any)[k]] as const)
]

/** Like Object.assign, but it will preserve getters instead of evaluating them. */
export const defineProperties: <base extends object, merged extends object>(
	base: base,
	merged: merged
) => merge<base, merged> = (base, merged) =>
	// declared like this to avoid https://github.com/microsoft/TypeScript/issues/55049
	Object.defineProperties(
		base,
		Object.getOwnPropertyDescriptors(merged)
	) as never

/** Copies enumerable keys of o to a new object in alphabetical order */
export const withAlphabetizedKeys: <o extends object>(o: o) => o = (o: any) => {
	const keys = Object.keys(o).sort()
	const result: any = {}

	for (let i = 0; i < keys.length; i++) result[keys[i]] = o[keys[i]]

	return result
}

export type invert<t extends Record<PropertyKey, PropertyKey>> = {
	[k in t[keyof t]]: {
		[k2 in keyof t]: t[k2] extends k ? k2 : never
	}[keyof t]
} & unknown

export const invert = <t extends Record<PropertyKey, PropertyKey>>(
	t: t
): invert<t> => flatMorph(t as any, (k, v) => [v, k]) as never

export const unset = noSuggest("represents an uninitialized value")

export type unset = typeof unset

/**
 *  For each keyof o that also exists on jsDocSource, add associated JsDoc annotations to o.
 *  Does not preserve modifiers on o like optionality.
 */
export type withJsDoc<o, jsDocSource> = show<
	keyof o extends keyof jsDocSource ?
		keyof jsDocSource extends keyof o ?
			_withJsDoc<o, jsDocSource>
		:	Pick<_withJsDoc<o, jsDocSource>, keyof o & keyof jsDocSource>
	:	Pick<_withJsDoc<o, jsDocSource>, keyof o & keyof jsDocSource> & {
			[k in Exclude<keyof o, keyof jsDocSource>]: o[k]
		}
>

type _withJsDoc<o, jsDocSource> = {
	[k in keyof jsDocSource]-?: o[k & keyof o]
}

export type propertyDescriptorsOf<o extends object> = {
	[k in keyof o]: TypedPropertyDescriptor<o[k]>
}

export type keyWithValue<t, constraint> =
	keyof t extends infer k ?
		k extends keyof t ?
			t[k] extends constraint ?
				k
			:	never
		:	never
	:	never
