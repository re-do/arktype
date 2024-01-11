import {
	ReadonlyArray,
	capitalize,
	hasDefinedKey,
	hasKey,
	includes,
	printable,
	type autocomplete,
	type extend,
	type optionalizeKeys,
	type propwiseXor
} from "@arktype/util"
import type { Declaration, Prerequisite } from "../kinds.js"
import type { StaticArkOption } from "../scope.js"
import { nodeKinds, type NodeKind } from "../shared/define.js"
import type { TraversalContext, TraversalPath } from "./context.js"

export class ArkError extends TypeError {
	toString() {
		return this.message
	}

	throw(): never {
		throw this
	}
}

export class ArkTypeError<
	code extends ArkErrorCode = ArkErrorCode
> extends ArkError {
	constructor(
		public code: code,
		public context: ArkErrorContext<code>
	) {
		super()
	}

	get message() {
		return this.context.path.length === 0
			? capitalize(this.expected)
			: this.context.path.length === 1 &&
				  typeof this.context.path[0] === "number"
				? `Item at index ${this.context.path[0]} ${this.expected}`
				: `${this.context.path} ${this.expected}`
	}

	get problem() {
		return `must be ${this.expected}${
			this.actual ? ` (was ${this.actual})` : ""
		}`
	}

	get expected() {
		return this.context.expected
	}

	get actual() {
		return printable(this.context.data)
	}

	hasCode<code extends ArkErrorCode>(code: code): this is ArkTypeError<code> {
		return this.code === (code as never)
	}
}

export class ArkErrors extends ReadonlyArray<ArkTypeError> {
	constructor(protected ctx: TraversalContext) {
		super()
	}

	byPath: Record<string, ArkTypeError> = {}
	count = 0
	private mutable: ArkTypeError[] = this as never

	add<codeOrExpected extends autocomplete<ArkErrorCode>>(
		codeOrExpected: codeOrExpected,
		...rest: codeOrExpected extends ArkErrorCode
			? [input: ArkErrorInput<codeOrExpected>]
			: []
	): ArkTypeError {
		const data = this.ctx.data
		if (!includes(nodeKinds, codeOrExpected)) {
			// treat as the "expected" of a custom error
			const error = new ArkTypeError("predicate", {
				path: [...this.ctx.path],
				data,
				expected: codeOrExpected,
				get actual() {
					return printable(data)
				},
				get problem() {
					return `${codeOrExpected} ${this.actual}`
				}
			})
			this.mutable.push(error)
			return error
		}
		const code = codeOrExpected as NodeKindWithError
		const codeConfig = this.ctx.config[code]
		const input: ArkErrorInput = rest[0]!
		const ctx = {
			path: [...this.ctx.path],
			data: this.ctx.data,
			...input
			// ensure we have at least everything we need to call an ArkExpectedWriter
		} satisfies ArkExpectedContext
		ctx.expected = hasDefinedKey(input, "expected")
			? input.expected
			: codeConfig.expected(ctx as never)
		ctx.actual = hasDefinedKey(input, "actual")
			? input.actual
			: codeConfig.actual && codeConfig.actual?.(ctx.data as never)
		// ctx.problem = hasDefinedKey(input, "problem") ? input.
		const pathKey = this.ctx.path.join(".")
		// const existing = this.byPath[pathKey]
		// if (existing) {
		// if (existing.hasCode("intersection")) {
		// 	existing.rule.push(problem)
		// } else {
		// 	const problemIntersection = new ProblemIntersection(
		// 		[existing, problem],
		// 		problem.data,
		// 		problem.path
		// 	)
		// 	const existingIndex = this.indexOf(existing)
		// 	// If existing is found (which it always should be unless this was externally mutated),
		// 	// replace it with the new problem intersection. In case it isn't for whatever reason,
		// 	// just append the intersection.
		// 	this[existingIndex === -1 ? this.length : existingIndex] =
		// 		problemIntersection
		// 	this.byPath[pathKey] = problemIntersection
		// }
		// } else {
		const error = new ArkTypeError(codeOrExpected as ArkErrorCode, ctx as any)
		this.byPath[pathKey] = error
		this.mutable.push(error)
		//}
		this.count++
		return error as never
	}

	get summary() {
		return this.toString()
	}

	toString() {
		return this.join("\n")
	}

	throw(): never {
		throw new ArkError(`${this}`, { cause: this })
	}
}

export interface DerivableErrorContext<data = unknown> {
	expected: string
	actual: string | null
	problem: string
	data: data
	path: TraversalPath
}

export type NodeKindWithError = {
	[kind in NodeKind]: Declaration<kind>["errorContext"] extends null
		? never
		: kind
}[NodeKind]

export type ArkErrorContextsByCode = extend<
	{
		[k in NodeKindWithError]: Declaration<k>["errorContext"]
	},
	StaticArkOption<"errors">
>

export type ArkErrorContext<code extends ArkErrorCode = ArkErrorCode> =
	ArkErrorContextsByCode[code]

export type ArkErrorCode = keyof ArkErrorContextsByCode

export type ArkProblemContext<code extends ArkErrorCode = ArkErrorCode> = Omit<
	ArkErrorContext<code>,
	"problem"
>

export type ArkExpectedContext<code extends ArkErrorCode = ArkErrorCode> = Omit<
	ArkProblemContext<code>,
	"actual" | "expected"
>

type ArkErrorInputByCode = {
	[code in ArkErrorCode]: optionalizeKeys<
		ArkErrorContextsByCode[code],
		keyof DerivableErrorContext
	>
}

export type ArkErrorInput<code extends ArkErrorCode = ArkErrorCode> =
	ArkErrorInputByCode[code]

export type ArkProblemWriter<code extends ArkErrorCode = ArkErrorCode> = (
	context: ArkErrorContext<code>
) => string

export type getAssociatedDataForError<code extends ArkErrorCode> =
	code extends NodeKind ? Prerequisite<code> : unknown

export type ArkActualWriter<code extends ArkErrorCode = ArkErrorCode> = (
	data: getAssociatedDataForError<code>
) => string

export type ArkResult<out = unknown> = propwiseXor<
	{ out: out },
	{ errors: ArkErrors }
>
