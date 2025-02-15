import {
	intrinsic,
	type ArkErrors,
	type BaseRoot,
	type Morph,
	type Union
} from "@ark/schema"
import {
	Callable,
	domainOf,
	throwParseError,
	type conform,
	type ErrorMessage,
	type ErrorType,
	type isDisjoint,
	type Key,
	type mutable,
	type numericStringKeyOf,
	type propValueOf,
	type unionToTuple
} from "@ark/util"
import type { distill, Out } from "./attributes.ts"
import type { type } from "./keywords/keywords.ts"
import type { Inferred } from "./methods/base.ts"
import type { BaseCompletions } from "./parser/string.ts"
import type { InternalScope } from "./scope.ts"

type MatchParserContext<input = unknown> = {
	cases: Morph[]
	$: unknown
	input: input
	key: PropertyKey | null
}

declare namespace ctx {
	export type from<ctx extends MatchParserContext> = ctx

	export type init<$, input = unknown> = from<{
		cases: []
		$: $
		input: input
		key: null
	}>

	export type atKey<ctx extends MatchParserContext, key extends string> = from<{
		cases: ctx["cases"]
		$: ctx["$"]
		input: ctx["input"]
		key: key
	}>
}

export interface MatchParser<$> extends CaseMatchParser<ctx.init<$>> {
	in<const def>(
		def: type.validate<def, $>
	): ChainableMatchParser<ctx.init<$, type.infer<def, $>>>
	in<const typedInput = never>(
		...args: [typedInput] extends [never] ?
			[
				ErrorMessage<"from requires a definition or type argument (from('string') or from<string>())">
			]
		:	[]
	): ChainableMatchParser<ctx.init<$, typedInput>>
	// include this signature a second time so that e.g. `match.from({ foo: "strin" })` shows the right error
	in<const def>(
		def: type.validate<def, $>
	): ChainableMatchParser<ctx.init<$, type.infer<def, $>>>

	case: CaseParser<ctx.init<$>>

	at: AtParser<ctx.init<$>>
}

type addCasesToContext<
	ctx extends MatchParserContext,
	cases extends unknown[]
> =
	cases extends Morph[] ?
		ctx.from<{
			$: ctx["$"]
			input: ctx["input"]
			cases: [...ctx["cases"], ...cases]
			key: ctx["key"]
		}>
	:	never

type addDefaultToContext<
	ctx extends MatchParserContext,
	defaultCase extends DefaultCase<ctx>
> = ctx.from<{
	$: ctx["$"]
	input: defaultCase extends "never" ? Morph.In<ctx["cases"][number]>
	:	ctx["input"]
	cases: defaultCase extends Morph ? [...ctx["cases"], defaultCase]
	: defaultCase extends "never" | "assert" ? ctx["cases"]
	: [...ctx["cases"], (In: ctx["input"]) => ArkErrors]
	key: ctx["key"]
}>

type casesToMorphTuple<cases, ctx extends MatchParserContext> = unionToTuple<
	propValueOf<{
		[def in Exclude<keyof cases, "default">]: cases[def] extends (
			Morph<never, infer o>
		) ?
			(In: inferCaseArg<def extends number ? `${number}` : def, ctx, "in">) => o
		:	never
	}>
>

type addCasesToParser<cases, ctx extends MatchParserContext> =
	cases extends { default: infer defaultDef extends DefaultCase<ctx> } ?
		finalizeMatchParser<
			addCasesToContext<ctx, casesToMorphTuple<cases, ctx>>,
			defaultDef
		>
	:	ChainableMatchParser<addCasesToContext<ctx, casesToMorphTuple<cases, ctx>>>

type inferCaseArg<
	def,
	ctx extends MatchParserContext,
	endpoint extends "in" | "out"
> = _finalizeCaseArg<
	ctx["key"] extends PropertyKey ?
		{ [k in ctx["key"]]: type.infer<def, ctx["$"]> }
	:	type.infer<def, ctx["$"]>,
	ctx,
	endpoint
>

type _finalizeCaseArg<
	t,
	ctx extends MatchParserContext,
	endpoint extends "in" | "out"
> =
	[distill<t, "in">, distill<t, endpoint>] extends [infer i, infer result] ?
		i extends ctx["input"] ? result
		: Extract<ctx["input"], i> extends never ? result
		: Extract<ctx["input"], result>
	:	never

type CaseParser<ctx extends MatchParserContext> = <const def, ret>(
	def: type.validate<def, ctx["$"]>,
	resolve: (In: inferCaseArg<def, ctx, "out">) => ret
) => ChainableMatchParser<
	addCasesToContext<ctx, [(In: inferCaseArg<def, ctx, "in">) => ret]>
>

type validateKey<key extends Key, ctx extends MatchParserContext> =
	ctx["key"] extends Key ? ErrorMessage<doubleAtMessage>
	: ctx["cases"]["length"] extends 0 ?
		keyof ctx["input"] extends never ?
			key
		:	conform<key, keyof ctx["input"]>
	:	ErrorMessage<chainedAtMessage>

interface AtParser<ctx extends MatchParserContext> {
	<const key extends string>(
		key: validateKey<key, ctx>
	): ChainableMatchParser<ctx.atKey<ctx, key>>

	<
		const key extends string,
		const cases,
		ctxAtKey extends MatchParserContext = ctx.atKey<ctx, key>
	>(
		key: validateKey<key, ctx>,
		cases: cases extends validateCases<cases, ctxAtKey> ? cases
		:	errorCases<cases, ctxAtKey>
	): addCasesToParser<cases, ctxAtKey>
}

interface ChainableMatchParser<ctx extends MatchParserContext> {
	case: CaseParser<ctx>
	match: CaseMatchParser<ctx>
	default: DefaultMethod<ctx>
	at: AtParser<ctx>
}

export type DefaultCaseKeyword = "never" | "assert" | "reject"

type DefaultCase<ctx extends MatchParserContext = MatchParserContext<any>> =
	| DefaultCaseKeyword
	| Morph<ctx["input"]>

type DefaultMethod<ctx extends MatchParserContext> = <
	const def extends DefaultCase<ctx>
>(
	def: def
) => finalizeMatchParser<ctx, def>

type validateCases<cases, ctx extends MatchParserContext> = {
	[def in
		| keyof cases
		| BaseCompletions<ctx["$"], {}, "default">]?: def extends "default" ?
		DefaultCase<ctx>
	: def extends number ? (In: inferCaseArg<`${def}`, ctx, "out">) => unknown
	: def extends type.validate<def, ctx["$"]> ?
		(In: inferCaseArg<def, ctx, "out">) => unknown
	:	type.validate<def, ctx["$"]>
}

type errorCases<cases, ctx extends MatchParserContext> = {
	[def in keyof cases]?: def extends "default" ? DefaultCase<ctx>
	: def extends number ? (In: inferCaseArg<`${def}`, ctx, "out">) => unknown
	: def extends type.validate<def, ctx["$"]> ?
		(In: inferCaseArg<def, ctx, "out">) => unknown
	:	ErrorType<type.validate<def, ctx["$"]>>
} & {
	[k in BaseCompletions<ctx["$"], {}>]?: (
		In: inferCaseArg<k, ctx, "out">
	) => unknown
} & {
	default?: DefaultCase<ctx>
}

export type CaseMatchParser<ctx extends MatchParserContext> = <const cases>(
	def: cases extends validateCases<cases, ctx> ? cases : errorCases<cases, ctx>
) => addCasesToParser<cases, ctx>

type finalizeMatchParser<
	ctx extends MatchParserContext,
	defaultCase extends DefaultCase<ctx>
> =
	addDefaultToContext<ctx, defaultCase> extends (
		infer ctx extends MatchParserContext
	) ?
		Match<ctx["input"], ctx["cases"]>
	:	never

export interface Match<In = any, cases extends Morph[] = Morph[]>
	extends Inferred<
		(In: Morph.In<cases[number]>) => Out<ReturnType<cases[number]>>
	> {
	<const data extends In>(
		data: data
	): {
		[i in numericStringKeyOf<cases>]: isDisjoint<
			data,
			Morph.In<cases[i]>
		> extends true ?
			never
		:	Morph.Out<cases[i]>
	}[numericStringKeyOf<cases>]
}

export class InternalMatchParser extends Callable<InternalCaseParserFn> {
	$: InternalScope

	constructor($: InternalScope) {
		super((...args) => new InternalChainedMatchParser($)(...args), {
			bind: $
		})
		this.$ = $
	}

	in(): InternalChainedMatchParser {
		return new InternalChainedMatchParser(this.$)
	}

	at(key: Key, cases?: InternalCases): InternalChainedMatchParser | Match {
		return new InternalChainedMatchParser(this.$).at(key, cases)
	}

	case(when: unknown, then: Morph): InternalChainedMatchParser {
		return new InternalChainedMatchParser(this.$).case(when, then)
	}
}

type InternalCases = Record<string, Morph | DefaultCase>

type InternalCaseParserFn = (
	cases: InternalCases
) => InternalChainedMatchParser | Match

export class InternalChainedMatchParser extends Callable<InternalCaseParserFn> {
	$: InternalScope
	protected key: Key | undefined
	protected branches: BaseRoot[] = []

	constructor($: InternalScope) {
		super(cases => {
			const entries = Object.entries(cases)
			for (let i = 0; i < entries.length; i++) {
				const [k, v] = entries[i]
				if (k === "default") {
					if (i !== entries.length - 1) {
						throwParseError(
							`default may only be specified as the last key of a switch definition`
						)
					}
					return this.default(v)
				}
				if (typeof v !== "function") {
					return throwParseError(
						`Value for case "${k}" must be a function (was ${domainOf(v)})`
					)
				}

				this.case(k, v)
			}

			return this
		})
		this.$ = $
	}

	at(key: Key, cases?: InternalCases): InternalChainedMatchParser | Match {
		if (this.key) throwParseError(doubleAtMessage)
		if (this.branches.length) throwParseError(chainedAtMessage)
		this.key = key
		return cases ? this.match(cases) : this
	}

	case(def: unknown, resolver: Morph): InternalChainedMatchParser {
		const wrappableDef = this.key ? { [this.key]: def } : def
		const branch = this.$.parse(wrappableDef).pipe(resolver as never)
		this.branches.push(branch)
		return this
	}

	match(cases: InternalCases): InternalChainedMatchParser | Match {
		return this(cases)
	}

	default(defaultCase: DefaultCase): Match {
		if (typeof defaultCase === "function")
			this.case(intrinsic.unknown, defaultCase)

		const schema: mutable<Union.Schema> = {
			branches: this.branches,
			ordered: true
		}

		if (defaultCase === "never" || defaultCase === "assert")
			schema.meta = { onFail: throwOnDefault }

		const matcher = this.$.finalize(this.$.node("union", schema))

		return matcher as never
	}
}

export const throwOnDefault: ArkErrors.Handler = errors => errors.throw()

export const chainedAtMessage = `A key matcher must be specified before the first case i.e. match.at('foo') or match.in<object>().at('bar')`
export type chainedAtMessage = typeof chainedAtMessage

export const doubleAtMessage = `At most one key matcher may be specified per expression`
export type doubleAtMessage = typeof doubleAtMessage
