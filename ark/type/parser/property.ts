import type {
	BaseParseContext,
	BaseRoot,
	UndeclaredKeyBehavior
} from "@ark/schema"
import {
	isArray,
	type anyOrNever,
	type ErrorMessage,
	type ErrorType,
	type typeToString
} from "@ark/util"
import {
	parseInnerDefinition,
	type inferDefinition,
	type validateInnerDefinition
} from "./definition.ts"
import type {
	ParsedKeyKind,
	writeInvalidSpreadTypeMessage
} from "./objectLiteral.ts"
import type { ParsedDefaultableProperty } from "./shift/operator/default.ts"
import type { parseString } from "./string.ts"

export type ParsedPropertyKind = "plain" | "optional" | "defaultable"

export type ParsedProperty =
	| ParsedRequiredProperty
	| ParsedOptionalProperty
	| ParsedDefaultableProperty

export type ParsedRequiredProperty = BaseRoot

export type ParsedOptionalProperty = readonly [BaseRoot, "?"]

export const parseProperty = (
	def: unknown,
	ctx: BaseParseContext
): ParsedProperty => {
	if (isArray(def)) {
		if (def[1] === "=")
			return [ctx.$.parseOwnDefinitionFormat(def[0], ctx), "=", def[2]]

		if (def[1] === "?")
			return [ctx.$.parseOwnDefinitionFormat(def[0], ctx), "?"]
	}

	// string-embedded defaults/optionals are handled by the string parser
	return parseInnerDefinition(def, ctx)
}

export type validateProperty<def, keyKind extends ParsedKeyKind, $, args> =
	[def] extends [anyOrNever] ?
		/** this extra [anyOrNever] check is required to ensure that nested `type` invocations
		 * like the following are not prematurely validated by the outer call:
		 *
		 * ```ts
		 * type({
		 * 	"test?": type("string").pipe(x => x === "true")
		 * })
		 * ```
		 */
		def
	: keyKind extends "spread" ?
		def extends validateInnerDefinition<def, $, args> ?
			inferDefinition<def, $, args> extends object ?
				def
			:	ErrorType<
					writeInvalidSpreadTypeMessage<
						typeToString<inferDefinition<def, $, args>>
					>
				>
		:	validateInnerDefinition<def, $, args>
	: keyKind extends "undeclared" ? UndeclaredKeyBehavior
	: keyKind extends "required" ? validateInnerDefinition<def, $, args>
	: // check to ensure we don't have an optional or defaultable value on
	// an already optional or index key
	def extends OptionalPropertyDefinition ?
		ErrorMessage<invalidOptionalKeyKindMessage>
	: isDefaultable<def, $, args> extends true ?
		ErrorMessage<invalidDefaultableKeyKindMessage>
	:	validateInnerDefinition<def, $, args>

export type isDefaultable<def, $, args> =
	def extends DefaultablePropertyTuple ? true
	: def extends PossibleDefaultableStringDefinition ?
		parseString<def, $, args> extends DefaultablePropertyTuple ?
			true
		:	false
	:	false

export type OptionalPropertyDefinition<baseDef = unknown> =
	| OptionalPropertyTuple<baseDef>
	| OptionalPropertyString<baseDef & string>

export type OptionalPropertyString<baseDef extends string = string> =
	`${baseDef}?`

export type OptionalPropertyTuple<baseDef = unknown> = readonly [baseDef, "?"]

// a precise type for a defaultable string definition
// isn't possible due to arbitrary whitespace surrounding "=",
// so that must be checked by parsing and testing if
// the root is a DefaultablePropertyTuple
export type PossibleDefaultableStringDefinition = `${string}=${string}`

export type DefaultablePropertyTuple<
	baseDef = unknown,
	thunkableProperty = unknown
> = readonly [baseDef, "=", thunkableProperty]

// single quote use here is better for TypeScript's inlined error to avoid escapes
export const invalidOptionalKeyKindMessage = `Only required keys may make their values optional, e.g. { [mySymbol]: ['number', '?'] }`

export type invalidOptionalKeyKindMessage = typeof invalidOptionalKeyKindMessage

// single quote use here is better for TypeScript's inlined error to avoid escapes
export const invalidDefaultableKeyKindMessage = `Only required keys may specify default values, e.g. { value: 'number = 0' }`

export type invalidDefaultableKeyKindMessage =
	typeof invalidDefaultableKeyKindMessage
