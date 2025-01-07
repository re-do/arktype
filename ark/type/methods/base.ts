import type {
	ArkErrors,
	BaseRoot,
	Disjoint,
	JsonSchema,
	MetaSchema,
	Morph,
	Predicate,
	StandardSchemaV1,
	UndeclaredKeyBehavior
} from "@ark/schema"
import type {
	anyOrNever,
	array,
	Callable,
	ErrorMessage,
	inferred,
	JsonStructure,
	unset
} from "@ark/util"
import type {
	defaultFor,
	distill,
	inferIntersection,
	inferMorphOut,
	inferPipes,
	InferredMorph,
	Out,
	To
} from "../attributes.ts"
import type { ArkAmbient } from "../config.ts"
import type { type } from "../keywords/keywords.ts"
import type { Scope } from "../scope.ts"
import type { ArrayType } from "./array.ts"
import type { instantiateType } from "./instantiate.ts"

/** @ts-ignore cast variance */
interface Type<out t = unknown, $ = {}>
	extends Callable<(data: unknown) => distill.Out<t> | ArkErrors> {
	internal: BaseRoot
	[inferred]: t

	/**
	 * @internal
	 * The precompiled JS used to optimize validation.
	 * Will be `undefined` in [jitless](https://arktype.io/docs/configuration#jitless) mode.
	 */
	precompilation: string | undefined

	/**
	 * The generic parameter representing this Type
	 *
	 * ⚠️ May contain types representing morphs or default values that would
	 * be inaccurate if used directly for runtime values. In those cases,
	 * you should use {@link infer} or {@link inferIn} on this object instead.
	 *
	 * @typeonly
	 */
	t: t

	/**
	 * The {@link Scope} in which definitions for this Type its chained methods are parsed
	 */
	$: Scope<$>

	/**
	 * The type of data this returns
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type ParsedNumber = typeof parseNumber.infer // number
	 *
	 * @typeonly
	 */
	infer: this["inferOut"]

	/**
	 * Alias of {@link infer}
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type ParsedNumber = typeof parseNumber.infer // number
	 *
	 * @typeonly
	 */
	inferOut: distill.Out<t>

	inferIntrospectableOut: distill.introspectable.Out<t>

	/**
	 * The type of data this expects
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type UnparsedNumber = typeof parseNumber.inferIn // string
	 *
	 * @typeonly
	 */
	inferIn: distill.In<t>

	/** The internal JSON representation */
	json: JsonStructure

	/** Alias of {@link json} for `JSON.stringify` compatibility */
	toJSON(): JsonStructure

	/**
	 * Generate a JSON Schema
	 * @throws {JsonSchema.UnjsonifiableError} if this is not convertible to JSON Schema
	 */
	toJsonSchema(): JsonSchema

	/**
	 * Metadata like custom descriptions and error messages
	 *
	 * The type of this property [can be extended](https://arktype.io/docs/configuration#custom) by your project.
	 */
	meta: ArkAmbient.meta

	/** An English description */
	description: string

	/** A syntactic representation */
	expression: string

	/**
	 * Attempt to apply validation and morph logic, either returning valid output or throwing.
	 * @throws {AggregateError}
	 */
	assert(data: unknown): this["infer"]

	/**
	 * Check errors.
	 * @example type.string.allows(9) // false
	 */
	allows(data: unknown): data is this["inferIn"]

	configure(meta: MetaSchema): this

	describe(description: string): this

	/**
	 * Clone to a new Type with the specified undeclared key behavior.
	 *
	 * {@inheritDoc UndeclaredKeyBehavior}
	 */
	onUndeclaredKey(behavior: UndeclaredKeyBehavior): this

	/**
	 * Deeply clone to a new Type with the specified undeclared key behavior.
	 *
	 * {@inheritDoc UndeclaredKeyBehavior}
	 **/
	onDeepUndeclaredKey(behavior: UndeclaredKeyBehavior): this

	/**
	 * Identical to `assert`, but with a typed input as a convenience for providing a typed value.
	 * @example const ConfigT = type({ foo: "string" }); export const config = ConfigT.from({ foo: "bar" })
	 */
	from(literal: this["inferIn"]): this["infer"]

	/**
	 * A `Type` representing the deeply-extracted input of the `Type` (before morphs are applied).
	 * @example const inputT = T.in
	 */
	get in(): instantiateType<this["inferIn"], $>

	/**
	 * A `Type` representing the deeply-extracted output of the `Type` (after morphs are applied).\
	 * **IMPORTANT**: If your type includes morphs, their output will likely be unknown
	 *   unless they were defined with an explicit output validator via `.to(outputType)`, `.pipe(morph, outputType)`, etc.
	 * @example const outputT = T.out
	 */
	get out(): instantiateType<this["inferIntrospectableOut"], $>

	/**
	 * Cast the way this `Type` is inferred (has no effect at runtime).
	 * const branded = type(/^a/).as<`a${string}`>() // Type<`a${string}`>
	 */
	as<castTo = unset>(
		...args: validateChainedAsArgs<castTo>
	): instantiateType<castTo, $>

	brand<const name extends string, r = type.brand<t, name>>(
		name: name
	): instantiateType<r, $>

	/**
	 * Intersect another `Type` definition, throwing an error if the result is unsatisfiable.
	 * @example const intersection = type({ foo: "number" }).intersect({ bar: "string" }) // Type<{ foo: number; bar: string }>
	 */
	and<const def, r = type.infer<def, $>>(
		def: type.validate<def, $>
	): instantiateType<inferIntersection<t, r>, $>

	/**
	 * Union another `Type` definition.\
	 * If the types contain morphs, input shapes should be distinct. Otherwise an error will be thrown.
	 * @example const union = type({ foo: "number" }).or({ foo: "string" }) // Type<{ foo: number } | { foo: string }>
	 * @example const union = type("string.numeric.parse").or("number") // Type<((In: string) => Out<number>) | number>
	 */
	or<const def, r = type.infer<def, $>>(
		def: type.validate<def, $>
	): instantiateType<t | r, $>

	/**
	 * Create a `Type` for array with elements of this `Type`
	 * @example const T = type(/^foo/); const array = T.array() // Type<string[]>
	 */
	array(): ArrayType<t[], $>

	optional(): [this, "?"]

	/**
	 * Add a default value for this `Type` when it is used as a property.\
	 * Default value should be a valid input value for this `Type, or a function that returns a valid input value.\
	 * If the type has a morph, it will be applied to the default value.
	 * @example const withDefault = type({ foo: type("string").default("bar") }); withDefault({}) // { foo: "bar" }
	 * @example const withFactory = type({ foo: type("number[]").default(() => [1])) }); withFactory({baz: 'a'}) // { foo: [1], baz: 'a' }
	 * @example const withMorph = type({ foo: type("string.numeric.parse").default("123") }); withMorph({}) // { foo: 123 }
	 */
	default<const value extends defaultFor<this["inferIn"]>>(
		value: value
	): [this, "=", value]

	filter<
		narrowed extends this["inferIn"] = never,
		r = [narrowed] extends [never] ? t
		: t extends InferredMorph<any, infer o> ? (In: narrowed) => o
		: narrowed
	>(
		predicate: Predicate.Castable<this["inferIn"]>
	): instantiateType<r, $>

	/**
	 * Add a custom predicate to this `Type`.
	 * @example const nan = type('number').narrow(n => Number.isNaN(n)) // Type<number>
	 * @example const foo = type("string").narrow((s): s is `foo${string}` => s.startsWith('foo') || ctx.mustBe('string starting with "foo"')) // Type<"foo${string}">
	 * @example const unique = type('string[]').narrow((a, ctx) => new Set(a).size === a.length || ctx.mustBe('array with unique elements'))
	 */
	narrow<
		narrowed extends this["infer"] = never,
		r = [narrowed] extends [never] ? t
		: t extends InferredMorph<infer i, infer o> ?
			o extends To ?
				(In: i) => To<narrowed>
			:	(In: i) => Out<narrowed>
		:	narrowed
	>(
		predicate: Predicate.Castable<this["infer"], narrowed>
	): instantiateType<r, $>

	/**
	 * Morph this `Type` through a chain of morphs.
	 * @example const dedupe = type('string[]').pipe(a => Array.from(new Set(a)))
	 * @example type({codes: 'string.numeric[]'}).pipe(obj => obj.codes).to('string.numeric.parse[]')
	 */
	pipe: ChainedPipe<t, $>

	// inferring r into an alias improves perf and avoids return type inference
	// that can lead to incorrect results. See:
	// https://discord.com/channels/957797212103016458/1285420361415917680/1285545752172429312
	/**
	 * Intersect another `Type` definition, returning an introspectable `Disjoint` if the result is unsatisfiable.
	 * @example const intersection = type({ foo: "number" }).intersect({ bar: "string" }) // Type<{ foo: number; bar: string }>
	 * @example const intersection = type({ foo: "number" }).intersect({ foo: "string" }) // Disjoint
	 */
	intersect<const def, r = type.infer<def, $>>(
		def: type.validate<def, $>
	): instantiateType<inferIntersection<t, r>, $> | Disjoint

	equals<const def>(def: type.validate<def, $>): boolean

	ifEquals<const def, r = type.infer<def, $>>(
		def: type.validate<def, $>
	): instantiateType<r, $> | undefined

	extends<const def>(other: type.validate<def, $>): boolean

	ifExtends<const def, r = type.infer<def, $>>(
		other: type.validate<def, $>
	): instantiateType<r, $> | undefined

	overlaps<const def>(r: type.validate<def, $>): boolean

	extract<const def, r = type.infer<def, $>>(
		r: type.validate<def, $>
	): instantiateType<Extract<t, r>, $>

	exclude<const def, r = type.infer<def, $>>(
		r: type.validate<def, $>
	): instantiateType<Exclude<t, r>, $>

	traverse(data: unknown): this["infer"] | ArkErrors

	/**
	 * @experimental
	 * Map and optionally reduce branches of a union. Types that are not unions
	 * are treated as a single branch.
	 *
	 * @param mapBranch - the mapping function, accepting a branch Type
	 *     Returning another `Type` is common, but any value can be returned and
	 *     inferred as part of the output.
	 *
	 * @param [reduceMapped] - an operation to perform on the mapped branches
	 *     Can be used to e.g. merge an array of returned Types representing
	 *     branches back to a single union.
	 */
	distribute<mapOut, reduceOut = mapOut[]>(
		mapBranch: (branch: Type, i: number, branches: array<Type>) => mapOut,
		reduceMapped?: (mappedBranches: mapOut[]) => reduceOut
	): reduceOut

	/** The Type's [StandardSchema](https://github.com/standard-schema/standard-schema) properties */
	"~standard": StandardSchemaV1.ArkTypeProps<this["inferIn"], this["inferOut"]>

	// deprecate Function methods so they are deprioritized as suggestions

	/** @deprecated */
	apply: Function["apply"]

	/** @deprecated */
	bind: Function["bind"]

	/** @deprecated */
	call: Function["call"]

	/** @deprecated */
	caller: Function

	/** @deprecated */
	length: number

	/** @deprecated */
	name: string

	/** @deprecated */
	prototype: Function["prototype"]

	/** @deprecated */
	arguments: Function["arguments"]

	// TS suggests Symbol to allow builtin symbolic access, so override that as well
	/** @deprecated */
	Symbol: never
}

interface ChainedPipeSignature<t, $> {
	<a extends Morph<distill.Out<t>>, r = instantiateType<inferPipes<t, [a]>, $>>(
		a: a
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		r = instantiateType<inferPipes<t, [a, b]>, $>
	>(
		a: a,
		b: b
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		r = instantiateType<inferPipes<t, [a, b, c]>, $>
	>(
		a: a,
		b: b,
		c: c
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		r = instantiateType<inferPipes<t, [a, b, c, d]>, $>
	>(
		a: a,
		b: b,
		c: c,
		d: d
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>,
		r = instantiateType<inferPipes<t, [a, b, c, d, e]>, $>
	>(
		a: a,
		b: b,
		c: c,
		d: d,
		e: e
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>,
		f extends Morph<inferMorphOut<e>>,
		r = instantiateType<inferPipes<t, [a, b, c, d, e, f]>, $>
	>(
		a: a,
		b: b,
		c: c,
		d: d,
		e: e,
		f: f
	): NoInfer<r> extends infer result ? result : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>,
		f extends Morph<inferMorphOut<e>>,
		g extends Morph<inferMorphOut<f>>,
		r = instantiateType<inferPipes<t, [a, b, c, d, e, f, g]>, $>
	>(
		a: a,
		b: b,
		c: c,
		d: d,
		e: e,
		f: f,
		g: g
	): NoInfer<r> extends infer result ? result : never
}

export interface ChainedPipe<t, $> extends ChainedPipeSignature<t, $> {
	try: ChainedPipeSignature<t, $>
}

type validateChainedAsArgs<t> =
	[t] extends [unset] ?
		[t] extends [anyOrNever] ?
			[]
		:	[
				ErrorMessage<"as requires an explicit type parameter like myType.as<t>()">
			]
	:	[]

export type { Type as BaseType }
