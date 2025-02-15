import type {
	BaseMappedPropInner,
	OptionalMappedPropInner,
	Prop
} from "@ark/schema"
import type {
	arkGet,
	arkIndexableOf,
	arkKeyOf,
	array,
	ErrorType,
	inferred,
	intersectUnion,
	JsonStructure,
	Key,
	listable,
	merge,
	optionalKeyOf,
	show,
	toArkKey
} from "@ark/util"
import type { Default, withDefault } from "../attributes.ts"
import type { type } from "../keywords/keywords.ts"
import type { ArrayType } from "./array.ts"
import type { BaseType } from "./base.ts"
import type { instantiateType } from "./instantiate.ts"

/** @ts-ignore cast variance */
interface Type<out t extends object = object, $ = {}> extends BaseType<t, $> {
	readonly(): t extends array ? ArrayType<{ readonly [i in keyof t]: t[i] }, $>
	:	Type<{ readonly [k in keyof t]: t[k] }, $>

	keyof(): instantiateType<arkKeyOf<t>, $>

	/**
	 * Get the `Type` of a property of this `Type<object>`.
	 * @example type({ foo: "string" }).get("foo") // Type<string>
	 */
	get<
		const k1 extends arkIndexableOf<t>,
		r = instantiateType<arkGet<t, k1>, $>
	>(
		k1: k1 | type.cast<k1>
	): r extends infer _ ? _ : never
	get<
		const k1 extends arkIndexableOf<t>,
		const k2 extends arkIndexableOf<arkGet<t, k1>>,
		r = instantiateType<arkGet<arkGet<t, k1>, k2>, $>
	>(
		k1: k1 | type.cast<k1>,
		k2: k2 | type.cast<k2>
	): r extends infer _ ? _ : never
	get<
		const k1 extends arkIndexableOf<t>,
		const k2 extends arkIndexableOf<arkGet<t, k1>>,
		const k3 extends arkIndexableOf<arkGet<arkGet<t, k1>, k2>>,
		r = instantiateType<arkGet<arkGet<arkGet<t, k1>, k2>, k3>, $>
	>(
		k1: k1 | type.cast<k1>,
		k2: k2 | type.cast<k2>,
		k3: k3 | type.cast<k3>
	): r extends infer _ ? _ : never

	/**
	 * Create a copy of this `Type` with only the specified properties.
	 * @example type({ foo: "string", bar: "number" }).pick("foo") // Type<{ foo: string }>
	 */
	pick<const key extends arkKeyOf<t> = never>(
		...keys: (key | type.cast<key>)[]
	): Type<
		{
			[k in keyof t as Extract<toArkKey<t, k>, key>]: t[k]
		},
		$
	>

	/**
	 * Create a copy of this `Type` with all properties except the specified ones.
	 * @example type({ foo: "string", bar: "number" }).omit("foo") // Type<{ bar: number }>
	 */
	omit<const key extends arkKeyOf<t> = never>(
		...keys: (key | type.cast<key>)[]
	): Type<
		{
			[k in keyof t as Exclude<toArkKey<t, k>, key>]: t[k]
		},
		$
	>

	/**
	 * Merge another `Type` definition, overriding properties of this `Type` with the duplicate keys.
	 * @example type({ a: "1", b: "2" }).merge({ b: "3", c: "4" }) // Type<{ a: 1, b: 3, c: 4 }>
	 */
	merge<
		const def,
		inferredDef = type.infer<def, $>,
		r = Type<merge<t, inferredDef>, $>
	>(
		def: type.validate<def, $> &
			(inferredDef extends object ? unknown
			:	ErrorType<"Merged type must be an object", [actual: inferredDef]>)
	): r extends infer _ ? _ : never

	/**
	 * Create a copy of this `Type` with all properties required.
	 * @example const T = type({ "foo?"": "string" }).required() // Type<{ foo: string }>
	 */
	required(): Type<{ [k in keyof t]-?: t[k] }, $>

	/**
	 * Create a copy of this `Type` with all properties optional.
	 * @example: const T = type({ foo: "string" }).optional() // Type<{ foo?: string }>
	 */
	partial(): Type<{ [k in keyof t]?: t[k] }, $>

	map<
		transformed extends listable<MappedTypeProp>,
		r = Type<constructMapped<t, transformed>, $>
	>(
		// v isn't used directly here but helps TS infer a precise type for transformed
		flatMapEntry: (entry: typePropOf<t, $>) => transformed
	): r extends infer _ ? _ : never

	/**
	 * List of property info of this `Type<object>`.
	 * @example type({ foo: "string = "" }).props // [{ kind: "required", key: "foo", value: Type<string>, default: "" }]
	 */
	props: array<typePropOf<t, $>>
}

type typePropOf<o, $> =
	keyof o extends infer k ?
		k extends keyof o ?
			typeProp<o, k, $>
		:	never
	:	never

type typeProp<o, k extends keyof o, $, t = o[k] & ({} | null)> =
	t extends Default<infer t, infer defaultValue> ?
		DefaultedTypeProp<k & Key, t, defaultValue, $>
	:	BaseTypeProp<
			k extends optionalKeyOf<o> ? "optional" : "required",
			k & Key,
			t,
			$
		>

export interface BaseTypeProp<
	kind extends Prop.Kind = Prop.Kind,
	k extends Key = Key,
	/** @ts-ignore cast variance */
	out v = unknown,
	$ = {}
> {
	kind: kind
	key: k
	value: instantiateType<v, $>
	meta: ArkEnv.meta
	toJSON: () => JsonStructure
}

export interface DefaultedTypeProp<
	k extends Key = Key,
	v = unknown,
	defaultValue = v,
	$ = {}
> extends BaseTypeProp<"optional", k, v, $> {
	default: defaultValue
}

type MappedTypeProp<k extends Key = Key, v = unknown> =
	| BaseMappedTypeProp<k, v>
	| OptionalMappedTypeProp<k, v>

type BaseMappedTypeProp<k extends Key, v> = merge<
	BaseMappedPropInner,
	{
		key: k
		value: type.cast<v>
	}
>

type OptionalMappedTypeProp<k extends Key, v> = merge<
	OptionalMappedPropInner,
	{
		key: k
		value: type.cast<v>
		default?: v
	}
>

type constructMapped<t, transformed extends listable<MappedTypeProp>> = show<
	intersectUnion<
		fromTypeProps<t, transformed extends array ? transformed : [transformed]>
	>
>

type fromTypeProps<t, props extends array<MappedTypeProp>> = show<
	{
		[prop in props[number] as Extract<
			applyHomomorphicOptionality<t, prop>,
			{ kind: "required" }
		>["key"]]: prop["value"][inferred]
	} & {
		[prop in props[number] as Extract<
			applyHomomorphicOptionality<t, prop>,
			{ kind: "optional"; default?: never }
		>["key"]]?: prop["value"][inferred]
	} & {
		[prop in props[number] as Extract<
			applyHomomorphicOptionality<t, prop>,
			{ kind: "optional"; default: unknown }
		>["key"]]: withDefault<
			prop["value"][inferred],
			prop["default" & keyof prop]
		>
	}
>

type applyHomomorphicOptionality<t, prop extends MappedTypeProp> =
	prop["kind"] extends string ? prop
	:	prop & {
			kind: prop["key"] extends optionalKeyOf<t> ? "optional" : "required"
		}

export type { Type as ObjectType }
