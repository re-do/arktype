import {
	ArkErrors,
	BaseRoot,
	type BaseMeta,
	type Disjoint,
	type DivisorSchema,
	type ExactLengthSchema,
	type ExclusiveDateRangeSchema,
	type ExclusiveNumericRangeSchema,
	type InclusiveDateRangeSchema,
	type InclusiveNumericRangeSchema,
	type InnerRoot,
	type Morph,
	type NodeSchema,
	type Out,
	type Predicate,
	type PrimitiveConstraintKind,
	type RegexSchema,
	type ambient,
	type constrain,
	type constraintKindOf,
	type distillIn,
	type distillOut,
	type includesMorphs,
	type inferIntersection,
	type inferMorphOut,
	type inferNarrow,
	type inferPipes
} from "@arktype/schema"
import {
	Callable,
	type Constructor,
	type array,
	type conform
} from "@arktype/util"

import { Generic, type validateParameterString } from "./generic.js"
import type {
	inferDefinition,
	validateDeclared,
	validateDefinition
} from "./parser/definition.js"
import { parseGenericParams } from "./parser/generic.js"
import type {
	IndexOneOperator,
	IndexZeroOperator,
	TupleInfixOperator
} from "./parser/tuple.js"
import type { RawScope, Scope, bindThis } from "./scope.js"

/** The convenience properties attached to `type` */
export type TypeParserAttachments =
	// map over to remove call signatures
	Omit<TypeParser, never>

export interface TypeParser<$ = {}> {
	// Parse and check the definition, returning either the original input for a
	// valid definition or a string representing an error message.
	<const def>(def: validateTypeRoot<def, $>): Type<inferTypeRoot<def, $>, $>

	// Spread version of a tuple expression
	<const zero, const one, const rest extends array>(
		_0: zero extends IndexZeroOperator ? zero : validateTypeRoot<zero, $>,
		_1: zero extends "keyof" ? validateTypeRoot<one, $>
		: zero extends "instanceof" ? conform<one, Constructor>
		: zero extends "===" ? conform<one, unknown>
		: conform<one, IndexOneOperator>,
		..._2: zero extends "===" ? rest
		: zero extends "instanceof" ? conform<rest, readonly Constructor[]>
		: one extends TupleInfixOperator ?
			one extends ":" ? [Predicate<distillIn<inferTypeRoot<zero, $>>>]
			: one extends "=>" ? [Morph<distillOut<inferTypeRoot<zero, $>>, unknown>]
			: one extends "@" ? [string | BaseMeta]
			: [validateTypeRoot<rest[0], $>]
		:	[]
	): Type<inferTypeRoot<[zero, one, ...rest], $>, $>

	<params extends string, const def>(
		params: `<${validateParameterString<params>}>`,
		def: validateDefinition<
			def,
			$,
			{
				[param in parseGenericParams<params>[number]]: unknown
			}
		>
	): Generic<parseGenericParams<params>, def, $>

	errors: typeof ArkErrors
}

const typeParserAttachments = Object.freeze({
	errors: ArkErrors
} satisfies TypeParserAttachments)

export class RawTypeParser extends Callable<
	(...args: unknown[]) => BaseRoot | Generic,
	TypeParserAttachments
> {
	constructor($: RawScope) {
		super(
			(...args) => {
				if (args.length === 1) {
					// treat as a simple definition
					return $.parseRoot(args[0])
				}
				if (
					args.length === 2 &&
					typeof args[0] === "string" &&
					args[0][0] === "<" &&
					args[0].at(-1) === ">"
				) {
					// if there are exactly two args, the first of which looks like <${string}>,
					// treat as a generic
					const params = parseGenericParams(args[0].slice(1, -1))
					const def = args[1]
					// TODO: validateUninstantiatedGeneric, remove this cast
					return new Generic(params, def, $ as never) as never
				}
				// otherwise, treat as a tuple expression. technically, this also allows
				// non-expression tuple definitions to be parsed, but it's not a supported
				// part of the API as specified by the associated types
				return $.parseRoot(args)
			},
			{ bind: $, attach: typeParserAttachments }
		)
	}
}

export type DeclarationParser<$> = <preinferred>() => {
	// for some reason, making this a const parameter breaks preinferred validation
	type: <def>(
		def: validateDeclared<preinferred, def, $ & ambient, bindThis<def>>
	) => Type<preinferred, $>
}

// this is declared as a class internally so we can ensure all "abstract"
// methods of BaseRoot are overridden, but we end up exporting it as an interface
// to ensure it is not accessed as a runtime value
declare class _Type<t = unknown, $ = any> extends InnerRoot<t, $> {
	$: Scope<$>;

	get in(): Type<this["tIn"], $>
	get out(): Type<this["tOut"], $>

	intersect<def>(
		def: validateTypeRoot<def, $>
	): Type<inferIntersection<t, inferTypeRoot<def, $>>> | Disjoint

	and<def>(
		def: validateTypeRoot<def, $>
	): Type<inferIntersection<t, inferTypeRoot<def, $>>, $>

	or<def>(def: validateTypeRoot<def, $>): Type<t | inferTypeRoot<def, $>, $>

	array(): Type<t[], $>

	keyof(): Type<keyof this["inferIn"], $>

	pipe<a extends Morph<this["infer"]>>(a: a): Type<inferPipes<t, [a]>, $>
	pipe<a extends Morph<this["infer"]>, b extends Morph<inferMorphOut<a>>>(
		a: a,
		b: b
	): Type<inferPipes<t, [a, b]>, $>
	pipe<
		a extends Morph<this["infer"]>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>
	>(a: a, b: b, c: c): Type<inferPipes<t, [a, b, c]>, $>
	pipe<
		a extends Morph<this["infer"]>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>
	>(a: a, b: b, c: c, d: d): Type<inferPipes<t, [a, b, c, d]>, $>
	pipe<
		a extends Morph<this["infer"]>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>
	>(a: a, b: b, c: c, d: d, e: e): Type<inferPipes<t, [a, b, c, d, e]>, $>
	pipe<
		a extends Morph<this["infer"]>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>,
		f extends Morph<inferMorphOut<e>>
	>(
		a: a,
		b: b,
		c: c,
		d: d,
		e: e,
		f: f
	): Type<inferPipes<t, [a, b, c, d, e, f]>, $>
	pipe<
		a extends Morph<this["infer"]>,
		b extends Morph<inferMorphOut<a>>,
		c extends Morph<inferMorphOut<b>>,
		d extends Morph<inferMorphOut<c>>,
		e extends Morph<inferMorphOut<d>>,
		f extends Morph<inferMorphOut<e>>,
		g extends Morph<inferMorphOut<f>>
	>(
		a: a,
		b: b,
		c: c,
		d: d,
		e: e,
		f: f,
		g: g
	): Type<inferPipes<t, [a, b, c, d, e, f, g]>, $>

	equals<def>(
		def: validateTypeRoot<def, $>
	): this is Type<inferTypeRoot<def>, $>

	// TODO: i/o
	extract<def>(r: validateTypeRoot<def, $>): Type<t, $>
	exclude<def>(r: validateTypeRoot<def, $>): Type<t, $>
	extends<def>(
		other: validateTypeRoot<def, $>
	): this is Type<inferTypeRoot<def>, $>

	constrain<
		kind extends PrimitiveConstraintKind,
		const def extends NodeSchema<kind>
	>(
		kind: conform<kind, constraintKindOf<this["inferIn"]>>,
		def: def
	): Type<constrain<t, kind, def>, $>

	narrow<def extends Predicate<distillOut<t>>>(
		def: def
	): Type<
		includesMorphs<t> extends true ?
			(In: this["tIn"]) => Out<inferNarrow<this["tOut"], def>>
		:	inferNarrow<t, def>,
		$
	>

	divisibleBy<const schema extends DivisorSchema>(
		this: this["inferIn"] extends number ? this : Type<number>,
		schema: schema
	): Type<constrain<t, "divisor", schema>, $>

	matching<const schema extends RegexSchema>(
		this: this["inferIn"] extends string ? this : Type<string>,
		schema: schema
	): Type<constrain<t, "regex", schema>, $>

	atLeast<const schema extends InclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "min", schema>, $>

	atMost<const schema extends InclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "max", schema>, $>

	moreThan<const schema extends ExclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "min", schema>, $>

	lessThan<const schema extends ExclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "max", schema>, $>

	atLeastLength<const schema extends InclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "minLength", schema>, $>

	atMostLength<const schema extends InclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "maxLength", schema>, $>

	moreThanLength<const schema extends ExclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "minLength", schema>, $>

	lessThanLength<const schema extends ExclusiveNumericRangeSchema>(
		schema: schema
	): Type<constrain<t, "maxLength", schema>, $>

	exactlyLength<const schema extends ExactLengthSchema>(
		schema: schema
	): Type<constrain<t, "exactLength", schema>, $>

	atOrAfter<const schema extends InclusiveDateRangeSchema>(
		schema: schema
	): Type<constrain<t, "after", schema>, $>

	atOrBefore<const schema extends InclusiveDateRangeSchema>(
		schema: schema
	): Type<constrain<t, "before", schema>, $>

	laterThan<const schema extends ExclusiveDateRangeSchema>(
		schema: schema
	): Type<constrain<t, "after", schema>, $>

	earlierThan<const schema extends ExclusiveDateRangeSchema>(
		schema: schema
	): Type<constrain<t, "before", schema>, $>
}

export interface Type<
	/** @ts-expect-error allow instantiation assignment to the base type */
	out t = unknown,
	$ = any
> extends _Type<t, $> {}

export type TypeConstructor<t = unknown, $ = any> = new (
	def: unknown,
	$: Scope<$>
) => Type<t, $>

export const Type: TypeConstructor = BaseRoot as never

export type DefinitionParser<$> = <def>(def: validateTypeRoot<def, $>) => def

export type validateTypeRoot<def, $ = {}> = validateDefinition<
	def,
	$ & ambient,
	bindThis<def>
>

export type inferTypeRoot<def, $ = {}> = inferDefinition<
	def,
	$ & ambient,
	bindThis<def>
>
