import type {
	BaseRoot,
	Disjoint,
	JsonSchema,
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
	inferPipe,
	inferPipes,
	InferredMorph,
	Out,
	To
} from "../attributes.ts"
import type { ArkAmbient, TypeMetaInput } from "../config.ts"
import type { type } from "../keywords/keywords.ts"
import type { Scope } from "../scope.ts"
import type { ArrayType } from "./array.ts"
import type { instantiateType } from "./instantiate.ts"

/** @ts-ignore cast variance */
export interface Inferred<out t = unknown, $ = {}> {
	internal: BaseRoot
	[inferred]: t

	/**
	 * precompiled JS used to optimize validation
	 *
	 * ⚠️ will be `undefined` in [jitless](https://arktype.io/docs/configuration#jitless) mode
	 */
	precompilation: string | undefined

	/**
	 * generic parameter representing this Type
	 *
	 * @typeonly
	 *
	 * ⚠️ May contain types representing morphs or default values that would
	 * be inaccurate if used directly for runtime values. In those cases,
	 * you should use {@link infer} or {@link inferIn} on this object instead.
	 */
	t: t

	/**
	 * #### {@link Scope} in which chained methods are parsed
	 */
	$: Scope<$>

	/**
	 * #### type of output this returns
	 *
	 * @typeonly
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type ParsedNumber = typeof parseNumber.infer // number
	 */
	infer: this["inferOut"]

	/**
	 * type of output this returns
	 *
	 * 🔗 alias of {@link infer}
	 * @typeonly
	 *
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type ParsedNumber = typeof parseNumber.infer // number
	 */
	inferOut: distill.Out<t>

	/**
	 * type of output that can be introspected at runtime (e.g. via {@link out})
	 *
	 * ⚠️ If your Type contains morphs, they will be inferred as `unknown` unless
	 * they are an ArkType keyword or have an explicitly defined output validator.
	 *
	 * @typeonly
	 *
	 * @example
	 * const unmorphed = type("string")
	 * // with no morphs, we can introspect the input and output as a single Type
	 * type UnmorphedOut = typeof unmorphed.inferIntrospectableOut // string
	 *
	 * const morphed = type("string").pipe(s => s.length)
	 * // with a standard user-defined morph, TypeScript can infer a
	 * // return type from your function, but we have no way to
	 * // know the shape at runtime
	 * type MorphOut = typeof morphed.inferIntrospectableOut  // unknown
	 *
	 * const validated = type("string").pipe(s => s.length).to("number")
	 * // morphs with validated output, including all morph keywords, are introspectable
	 * type ValidatedMorphOut = typeof validated.inferIntrospectableOut
	 */
	inferIntrospectableOut: distill.introspectable.Out<t>

	/**
	 * #### type of input this allows
	 *
	 * @typeonly
	 *
	 * @example
	 * const parseNumber = type("string").pipe(s => Number.parseInt(s))
	 * type UnparsedNumber = typeof parseNumber.inferIn // string
	 */
	inferIn: distill.In<t>

	/**
	 * #### internal JSON representation
	 */
	json: JsonStructure

	/**
	 * alias of {@link json} for `JSON.stringify` compatibility
	 */
	toJSON(): JsonStructure

	/**
	 * #### generate a JSON Schema
	 *
	 * @throws {JsonSchema.UnjsonifiableError} if this cannot be converted to JSON Schema
	 */
	toJsonSchema(): JsonSchema

	/**
	 * #### metadata like custom descriptions and error messages
	 *
	 * ✅ type {@link https://arktype.io/docs/configuration#custom | can be customized} for your project
	 */
	meta: ArkAmbient.meta

	/**
	 * #### human-readable English description
	 *
	 * ✅ works best for primitive values
	 *
	 * @example
	 * const n = type("0 < number <= 100")
	 * console.log(n.description) // positive and at most 100
	 */
	description: string

	/**
	 * #### syntax string similar to native TypeScript
	 *
	 * ✅ works well for both primitives and structures
	 *
	 * @example
	 * const loc = type({ coords: ["number", "number"] })
	 * console.log(loc.expression) // { coords: [number, number] }
	 */
	expression: string

	/**
	 * #### validate and return transformed data or throw
	 *
	 * ✅ sugar to avoid checking for {@link type.errors} if they are unrecoverable
	 *
	 * @example
	 * const criticalPayload = type({
	 *     superImportantValue: "string"
	 * })
	 * // throws AggregateError: superImportantValue must be a string (was missing)
	 * const data = criticalPayload.assert({ irrelevantValue: "whoops" })
	 * console.log(data.superImportantValue) // valid output can be accessed directly
	 *
	 * @throws {AggregateError}
	 */
	assert(data: unknown): this["infer"]

	/**
	 * #### check input without applying morphs
	 *
	 * ✅ good for stuff like filtering that doesn't benefit from detailed errors
	 *
	 * @example
	 * const numeric = type("number | bigint")
	 * // [0, 2n]
	 * const numerics = [0, "one", 2n].filter(numeric.allows)
	 */
	allows(data: unknown): data is this["inferIn"]

	/**
	 * #### add metadata to shallow references
	 *
	 * ⚠️ does not affect error messages within properties of an object
	 *
	 * @example
	 * const notOdd = type("number % 2").configure({ description: "not odd" })
	 * // all constraints at the root are affected
	 * const odd = notOdd(3) // must be not odd (was 3)
	 * const nonNumber = notOdd("two") // must be not odd (was "two")
	 *
	 * const notOddBox = type({
	 *    // we should have referenced notOdd or added meta here
	 *    notOdd: "number % 2",
	 * // but instead chained from the root object
	 * }).configure({ description: "not odd" })
	 * // error message at path notOdd is not affected
	 * const oddProp = notOddBox({ notOdd: 3 }) // notOdd must be even (was 3)
	 * // error message at root is affected, leading to a misleading description
	 * const nonObject = notOddBox(null) // must be not odd (was null)
	 */
	configure<meta extends TypeMetaInput>(meta: meta): this

	/**
	 * #### add description to shallow references
	 *
	 * 🔗 equivalent to `.configure({ description })` (see {@link configure})
	 * ⚠️ does not affect error messages within properties of an object
	 *
	 * @example
	 * const aToZ = type(/^a.*z$/).describe("a string like 'a...z'")
	 * const good = aToZ("alcatraz") // "alcatraz"
	 * // ArkErrors: must be a string like 'a...z' (was "albatross")
	 * const badPattern = aToZ("albatross")
	 */
	describe(description: string): this

	/**
	 * #### apply undeclared key behavior
	 *
	 * {@inheritDoc UndeclaredKeyBehavior}
	 */
	onUndeclaredKey(behavior: UndeclaredKeyBehavior): this

	/**
	 * #### deeply apply undeclared key behavior
	 *
	 * {@inheritDoc UndeclaredKeyBehavior}
	 **/
	onDeepUndeclaredKey(behavior: UndeclaredKeyBehavior): this

	/**
	 * #### alias for {@link assert} with typed input
	 *
	 * @example
	 * const t = type({ foo: "string" });
	 * // TypeScript: foo must be a string (was 5)
	 * const data = t.from({ foo: 5 });
	 */
	from(literal: this["inferIn"]): this["infer"]

	/**
	 * #### deeply extract inputs
	 *
	 * ✅ will never include morphs
	 * ✅ good for generating JSON Schema or other non-transforming formats
	 *
	 * @example
	 * const createUser = type({
	 *    age: "string.numeric.parse"
	 * })
	 * // { age: 25 } (age parsed to a number)
	 * const out = createUser({ age: "25" })
	 * // { age: "25" } (age is still a string)
	 * const inOut = createUser.in({ age: "25" })
	 */
	get in(): instantiateType<this["inferIn"], $>

	/**
	 * #### deeply extract outputs
	 *
	 * ✅ will never include morphs
	 * ⚠️ if your type includes morphs, their output will likely be unknown unless they
	 * were defined with an explicit output validator via `.to(outputDef)` or `.pipe(morph, outputType)`
	 *
	 * @example
	 * const userMorph = type("string[]").pipe(a => a.join(","))
	 *
	 * const t = type({
	 *    // all keywords have introspectable output
	 *    keyword: "string.numeric.parse",
	 *    // TypeScript knows this returns a boolean, but we can't introspect that at runtime
	 *    unvalidated: userMorph,
	 *    // if needed, it can be made introspectable with an output validator
	 *    validated: userMorph.to("string")
	 * })
	 *
	 * // Type<{ keyword: number; unvalidated: unknown; validated: string }>
	 * const baseOut = base.out
	 */
	get out(): instantiateType<this["inferIntrospectableOut"], $>

	/**
	 * #### add a compile-time brand to output
	 *
	 * @typenoop
	 *
	 * @example
	 * const palindrome = type("string")
	 *     .narrow(s => s === [...s].reverse().join(""))
	 *     .brand("palindrome")
	 * // Brand<string, "palindrome">
	 * const out = palindrome.assert("racecar")
	 */
	brand<const name extends string, r = instantiateType<type.brand<t, name>, $>>(
		name: name
	): r extends infer _ ? _ : never

	/**
	 * #### an array of this
	 *
	 * @example
	 * // Type<{ rebmun: number }[]>
	 * const t = type({ rebmun: "number" }).array();
	 */
	array(): ArrayType<t[], $>

	/**
	 * #### {@link https://arktype.io/docs/objects#properties-optional | optional definition}
	 *
	 * @chainedDefinition
	 *
	 * @example
	 * const prop = type({ foo: "number" })
	 * // Type<{ bar?: { foo: number } }>
	 * const obj = type({ bar: prop.optional() })
	 */
	optional(): [this, "?"]

	/**
	 * #### {@link https://arktype.io/docs/objects#properties-defaultable | defaultable definition}
	 *
	 * ✅ object defaults can be returned from a function
	 * ⚠️ throws if the default value is not allowed
	 * @chainedDefinition
	 *
	 * @example
	 * // Type<{ count: Default<number, 0> }>
	 * const state = type({ count: type.number.default(0) })
	 * const prop = type({ nested: "boolean" })
	 * const forObj = type({
	 *     key: nested.default(() => ({ nested: false }))
	 * })
	 */
	default<const value extends defaultFor<this["inferIn"]>>(
		value: value
	): [this, "=", value]

	/**
	 * #### apply a predicate function to input
	 *
	 * ⚠️ the behavior of {@link narrow}, this method's output counterpart, is usually more desirable
	 * ✅ most useful for morphs with input types that are re-used externally
	 * @predicateCast
	 *
	 * @example
	 * const stringifyUser = type({ name: "string" }).pipe(user => JSON.stringify(user))
	 * const stringifySafe = stringifyUser.filter(user => user.name !== "Bobby Tables")
	 * // Type<(In: `${string}Z`) => To<Date>>
	 * const withPredicate = type("string.date.parse").filter((s): s is `${string}Z` =>
	 *     s.endsWith("Z")
	 * )
	 */
	filter<
		narrowed extends this["inferIn"] = never,
		r = instantiateType<
			[narrowed] extends [never] ? t
			: t extends InferredMorph<any, infer o> ? (In: narrowed) => o
			: narrowed,
			$
		>
	>(
		predicate: Predicate.Castable<this["inferIn"], narrowed>
	): r extends infer _ ? _ : never

	/**
	 * #### apply a predicate function to output
	 *
	 * ✅ go-to fallback for validation not composable via builtin types and operators
	 * ✅ runs after all other validators and morphs, if present
	 * @predicateCast
	 *
	 * @example
	 * const palindrome = type("string").narrow(s => s === [...s].reverse().join(""))
	 *
	 * const palindromicEmail = type("string.date.parse").narrow((date, ctx) =>
	 *		date.getFullYear() === 2025 || ctx.mustBe("the current year")
	 * )
	 * // Type<`${string}.tsx`>
	 * const withPredicate = type("string").narrow((s): s is `${string}.tsx` => /\.tsx?$/.test(s))
	 */
	narrow<
		narrowed extends this["infer"] = never,
		r = instantiateType<
			[narrowed] extends [never] ? t
			: t extends InferredMorph<infer i, infer o> ?
				o extends To ?
					(In: i) => To<narrowed>
				:	(In: i) => Out<narrowed>
			:	narrowed,
			$
		>
	>(
		predicate: Predicate.Castable<this["infer"], narrowed>
	): r extends infer _ ? _ : never

	/**
	 * #### pipe output through arbitrary transformations or other Types
	 *
	 * @example
	 * const user = type({ name: "string" })
	 *
	 * // parse a string and validate that the result as a user
	 * const parseUser = type("string").pipe(s => JSON.parse(s), user)
	 */
	pipe: ChainedPipe<t, $>

	/**
	 * #### parse a definition as an output validator
	 *
	 * 🔗 `to({ name: "string" })` is equivalent to `.pipe(type({ name: "string" }))`
	 *
	 * @example
	 * // parse a string and validate that the result as a user
	 * const parseUser = type("string").pipe(s => JSON.parse(s)).to({ name: "string" })
	 */
	to<const def, r = instantiateType<inferPipe<t, type.infer<def, $>>, $>>(
		def: type.validate<def, $>
	): r extends infer _ ? _ : never
}

/** @ts-ignore cast variance */
interface Type<out t = unknown, $ = {}>
	extends Callable<(data: unknown) => distill.Out<t> | ArkEnv.onFail>,
		Inferred<t, $> {
	/**
	 * #### cast the way this is inferred
	 *
	 * @typenoop
	 *
	 * @example
	 * // Type<`LEEEEEEEE${string}ROY`>
	 * const leeroy = type(/^LE{8,}ROY$/).as<`LEEEEEEEE${string}ROY`>()
	 */
	as<castTo = unset>(
		...args: validateChainedAsArgs<castTo>
	): instantiateType<castTo, $>

	/**
	 * #### intersect the parsed Type, throwing if the result is unsatisfiable
	 *
	 * @example
	 * // Type<{ foo: number; bar: string }>
	 * const t = type({ foo: "number" }).and({ bar: "string" })
	 * // ParseError: Intersection at foo of number and string results in an unsatisfiable type
	 * const bad = type({ foo: "number" }).and({ foo: "string" })
	 */
	and<
		const def,
		r = instantiateType<inferIntersection<t, type.infer<def, $>>, $>
	>(
		def: type.validate<def, $>
	): r extends infer _ ? _ : never

	/**
	 * #### union with the parsed Type
	 *
	 * ⚠️ a union that could apply different morphs to the same data is a ParseError ([docs](https://arktype.io/docs/expressions/union-morphs))
	 *
	 * @example
	 * // Type<string | { box: string }>
	 * const t = type("string").or({ box: "string" })
	 */
	or<const def, r = instantiateType<t | type.infer<def, $>, $>>(
		def: type.validate<def, $>
	): r extends infer _ ? _ : never

	// inferring r into an alias improves perf and avoids return type inference
	// that can lead to incorrect results. See:
	// https://discord.com/channels/957797212103016458/1285420361415917680/1285545752172429312
	/**
	 * #### intersect the parsed Type, returning an introspectable {@link Disjoint} if the result is unsatisfiable
	 *
	 * @example
	 * // Type<{ foo: number; bar: string }>
	 * const t = type({ foo: "number" }).intersect({ bar: "string" })
	 * const bad = type("number > 10").intersect("number < 5")
	 * // logs "Intersection of > 10 and < 5 results in an unsatisfiable type"
	 * if (bad instanceof Disjoint) console.log(`${bad.summary}`)
	 */
	intersect<
		const def,
		r = instantiateType<inferIntersection<t, type.infer<def, $>>, $>
	>(
		def: type.validate<def, $>
	): r extends infer _ ? _ | Disjoint : never

	/**
	 * #### check if the parsed Type's constraints are identical
	 *
	 * ✅ equal types have identical input and output constraints and transforms
	 * @ignoresMeta
	 *
	 * @example
	 * const divisibleBy6 = type.number.divisibleBy(6).moreThan(0)
	 * // false (left side must also be positive)
	 * divisibleBy6.equals("number % 6")
	 * // false (right side has an additional <100 constraint)
	 * console.log(divisibleBy6.equals("0 < (number % 6) < 100"))
	 * const thirdTry = type("(number % 2) > 0").divisibleBy(3)
	 * // true (types are normalized and reduced)
	 * console.log(divisibleBy6.equals(thirdTry))
	 */
	equals<const def>(def: type.validate<def, $>): boolean

	/**
	 * #### narrow this based on an {@link equals} check
	 *
	 * @ignoresMeta
	 *
	 * @example
	 * const n = type.raw(`${Math.random()}`)
	 * // Type<0.5> | undefined
	 * const ez = n.ifEquals("0.5")
	 */
	ifEquals<const def, r = type.instantiate<def, $>>(
		def: type.validate<def, $>
	): r extends infer _ ? _ | undefined : never

	/**
	 * #### check if this is a subtype of the parsed Type
	 *
	 * ✅ a subtype must include all constraints from the base type
	 * ✅ unlike {@link equals}, additional constraints may be present
	 * @ignoresMeta
	 *
	 * @example
	 * type.string.extends("unknown") // true
	 * type.string.extends(/^a.*z$/) // false
	 */
	extends<const def>(other: type.validate<def, $>): boolean

	/**
	 * #### narrow this based on an {@link extends} check
	 *
	 * @ignoresMeta
	 *
	 * @example
	 * const n = type(Math.random() > 0.5 ? "true" : "0") // Type<0 | true>
	 * const ez = n.ifExtends("boolean") // Type<true> | undefined
	 */
	ifExtends<const def, r = type.instantiate<def, $>>(
		other: type.validate<def, $>
	): r extends infer _ ? _ | undefined : never

	/**
	 * #### check if a value could satisfy this and the parsed Type
	 *
	 * ⚠️ will return true unless a {@link Disjoint} can be proven
	 *
	 * @example
	 * type.string.overlaps("string | number") // true (e.g. "foo")
	 * type("string | number").overlaps("1") // true (1)
	 * type("number > 0").overlaps("number < 0") // false (no values exist)
	 *
	 * const noAt = type("string").narrow(s => !s.includes("@"))
	 * noAt.overlaps("string.email") // true (no values exist, but not provable)
	 */
	overlaps<const def>(r: type.validate<def, $>): boolean

	/**
	 * #### extract branches {@link extend}ing the parsed Type
	 *
	 * @example
	 * // Type<true | 0 | 2>
	 * const t = type("boolean | 0 | 'one' | 2 | bigint").extract("number | 0n | true")
	 */
	extract<
		const def,
		r = instantiateType<t extends type.infer<def, $> ? t : never, $>
	>(
		r: type.validate<def, $>
	): r extends infer _ extends r ? _ : never

	/**
	 * #### exclude branches {@link extend}ing the parsed Type
	 *
	 * @example
	 *
	 * // Type<false | 'one' | bigint>
	 * const t = type("boolean | 0 | 'one' | 2 | bigint").exclude("number | 0n | true")
	 */
	exclude<
		const def,
		r = instantiateType<t extends type.infer<def, $> ? never : t, $>
	>(
		r: type.validate<def, $>
	): r extends infer _ ? _ : never

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
	): r extends infer _ ? _ : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		r = instantiateType<inferPipes<t, [a, b]>, $>
	>(
		a: a,
		b: b
	): r extends infer _ ? _ : never
	<
		a extends Morph<distill.Out<t>>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		r = instantiateType<inferPipes<t, [a, b, c]>, $>
	>(
		a: a,
		b: b,
		c: c
	): r extends infer _ ? _ : never
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
	): r extends infer _ ? _ : never
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
	): r extends infer _ ? _ : never
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
	): r extends infer _ ? _ : never
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
	): r extends infer _ ? _ : never
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
