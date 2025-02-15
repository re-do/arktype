import {
	isKeyOf,
	Scanner,
	whitespaceChars,
	type EscapeChar,
	type WhitespaceChar
} from "@ark/util"
import type { Comparator } from "../reduce/shared.ts"

export class ArkTypeScanner<
	lookahead extends string = string
> extends Scanner<lookahead> {
	shiftUntilNextTerminator(): string {
		this.shiftUntilNonWhitespace()
		return this.shiftUntil(
			() => this.lookahead in ArkTypeScanner.terminatingChars
		)
	}

	static terminatingChars = {
		"<": 1,
		">": 1,
		"=": 1,
		"|": 1,
		"&": 1,
		")": 1,
		"[": 1,
		"%": 1,
		",": 1,
		":": 1,
		"?": 1,
		"#": 1,
		...whitespaceChars
	} as const

	static finalizingLookaheads = {
		">": 1,
		",": 1,
		"": 1,
		"=": 1,
		"?": 1
	} as const

	static lookaheadIsFinalizing = (
		lookahead: string,
		unscanned: string
	): lookahead is ">" | "," | "=" | "?" =>
		lookahead === ">" ?
			unscanned[0] === "=" ?
				// >== would only occur in an expression like Array<number>==5
				// otherwise, >= would only occur as part of a bound like number>=5
				unscanned[1] === "="
				// if > is the end of a generic instantiation, the next token will be
				// an operator or the end of the string
			:	unscanned.trimStart() === "" ||
				isKeyOf(unscanned.trimStart()[0], ArkTypeScanner.terminatingChars)
			// "=" is a finalizer on its own (representing a default value),
			// but not with a second "=" (an equality comparator)
		: lookahead === "=" ? unscanned[0] !== "="
			// "," and "?" are unambiguously finalizers
		: lookahead === "," || lookahead === "?"
}

export declare namespace ArkTypeScanner {
	export type lookaheadIsFinalizing<
		lookahead extends string,
		unscanned extends string
	> =
		lookahead extends ">" ?
			unscanned extends `=${infer nextUnscanned}` ?
				nextUnscanned extends `=${string}` ?
					true
				:	false
			: ArkTypeScanner.skipWhitespace<unscanned> extends (
				"" | `${TerminatingChar}${string}`
			) ?
				true
			:	false
		: lookahead extends "=" ?
			unscanned extends `=${string}` ?
				false
			:	true
		: lookahead extends "," | "?" ? true
		: false

	export type TerminatingChar = keyof typeof ArkTypeScanner.terminatingChars

	export type FinalizingLookahead =
		keyof typeof ArkTypeScanner.finalizingLookaheads

	export type InfixToken =
		| Comparator
		| "|"
		| "&"
		| "%"
		| ":"
		| "=>"
		| "|>"
		| "#"
		| "@"
		| "="

	export type PostfixToken = "[]" | "?"

	export type OperatorToken = InfixToken | PostfixToken

	export type shift<
		lookahead extends string,
		unscanned extends string
	> = `${lookahead}${unscanned}`

	export type shiftUntil<
		unscanned extends string,
		terminator extends string,
		scanned extends string = ""
	> =
		unscanned extends shift<infer lookahead, infer nextUnscanned> ?
			lookahead extends terminator ?
				scanned extends `${infer base}${EscapeChar}` ?
					shiftUntil<nextUnscanned, terminator, `${base}${lookahead}`>
				:	[scanned, unscanned]
			:	shiftUntil<nextUnscanned, terminator, `${scanned}${lookahead}`>
		:	[scanned, ""]

	export type shiftUntilNot<
		unscanned extends string,
		nonTerminator extends string,
		scanned extends string = ""
	> =
		unscanned extends shift<infer lookahead, infer nextUnscanned> ?
			lookahead extends nonTerminator ?
				shiftUntilNot<nextUnscanned, nonTerminator, `${scanned}${lookahead}`>
			:	[scanned, unscanned]
		:	[scanned, ""]

	export type shiftUntilNextTerminator<unscanned extends string> = shiftUntil<
		unscanned,
		TerminatingChar
	>

	export type skipWhitespace<unscanned extends string> = shiftUntilNot<
		unscanned,
		WhitespaceChar
	>[1]

	export type shiftResult<scanned extends string, unscanned extends string> = [
		scanned,
		unscanned
	]
}
