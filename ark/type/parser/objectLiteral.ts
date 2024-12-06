import {
	normalizeIndex,
	type BaseParseContext,
	type BaseRoot,
	type NodeSchema,
	type Structure,
	type unwrapDefault,
	type writeInvalidPropertyKeyMessage
} from "@ark/schema"
import {
	append,
	escapeChar,
	isEmptyObject,
	printable,
	stringAndSymbolicEntriesOf,
	throwParseError,
	type anyOrNever,
	type Dict,
	type ErrorMessage,
	type ErrorType,
	type EscapeChar,
	type Key,
	type merge,
	type mutable,
	type show
} from "@ark/util"
import type { withDefault } from "../attributes.ts"
import type { validateString } from "./ast/validate.ts"
import type { inferDefinition, validateDefinition } from "./definition.ts"
import {
	invalidDefaultKeyKindMessage,
	invalidOptionalKeyKindMessage,
	parseValue,
	type DefaultValueTuple,
	type OptionalValueTuple,
	type validateEntry
} from "./entry.ts"

type MutableStructureSchema = mutable<NodeSchema<"structure">, 2>

export const parseObjectLiteral = (
	def: Dict,
	ctx: BaseParseContext
): BaseRoot => {
	let spread: Structure.Node | undefined
	const structure: MutableStructureSchema = {}
	// We only allow a spread operator to be used as the first key in an object
	// because to match JS behavior any keys before the spread are overwritten
	// by the values in the target object, so there'd be no useful purpose in having it
	// anywhere except for the beginning.
	const defEntries = stringAndSymbolicEntriesOf(def)

	for (const [k, v] of defEntries) {
		const parsedKey = preparseKey(k)

		if (parsedKey.kind === "spread") {
			if (!isEmptyObject(structure))
				return throwParseError(nonLeadingSpreadError)
			const operand = ctx.$.parseOwnDefinitionFormat(v, ctx)
			if (!operand.hasKind("intersection") || !operand.structure) {
				return throwParseError(
					writeInvalidSpreadTypeMessage(operand.expression)
				)
			}
			spread = operand.structure
			continue
		}

		if (parsedKey.kind === "undeclared") {
			if (v !== "reject" && v !== "delete" && v !== "ignore")
				throwParseError(writeInvalidUndeclaredBehaviorMessage(v))
			structure.undeclared = v
			continue
		}

		const parsedValue = parseValue(v, ctx)
		const parsedEntryKey = parsedKey as PreparsedEntryKey

		if (parsedValue.kind === "optional") {
			if (parsedKey.kind !== "required")
				throwParseError(invalidOptionalKeyKindMessage)

			structure.optional = append(
				structure.optional,
				ctx.$.node("optional", {
					key: parsedKey.key,
					value: parsedValue.valueNode
				})
			)
		} else if (parsedValue.kind === "defaultable") {
			if (parsedKey.kind !== "required")
				throwParseError(invalidDefaultKeyKindMessage)

			structure.optional = append(
				structure.optional,
				ctx.$.node("optional", {
					key: parsedKey.key,
					value: parsedValue.value,
					default: parsedValue.default
				})
			)
		} else {
			const signature = ctx.$.parseOwnDefinitionFormat(parsedEntryKey.key, ctx)
			const normalized = normalizeIndex(signature, parsedValue.valueNode, ctx.$)

			if (normalized.index)
				structure.index = append(structure.index, normalized.index)

			if (normalized.required)
				structure.required = append(structure.required, normalized.required)
		}
	}

	const structureNode = ctx.$.node("structure", structure)

	return ctx.$.parseSchema({
		domain: "object",
		structure: spread?.merge(structureNode) ?? structureNode
	})
}

export type inferObjectLiteral<def extends object, $, args> = show<
	"..." extends keyof def ?
		merge<
			inferDefinition<def["..."], $, args>,
			_inferObjectLiteral<def, $, args>
		>
	:	_inferObjectLiteral<def, $, args>
>

/**
 * Infers the contents of an object literal, ignoring a spread definition
 */
type _inferObjectLiteral<def extends object, $, args> = {
	// since def is a const parameter, we remove the readonly modifier here
	// support for builtin readonly tracked here:
	// https://github.com/arktypeio/arktype/issues/808
	-readonly [k in keyof def as nonOptionalKeyFromEntry<k, def[k], $, args>]: [
		def[k]
	] extends [anyOrNever] ?
		def[k]
	: def[k] extends DefaultValueTuple<infer baseDef, infer thunkableValue> ?
		withDefault<
			inferDefinition<baseDef, $, args>,
			unwrapDefault<thunkableValue>
		>
	:	inferDefinition<def[k], $, args>
} & {
	-readonly [k in keyof def as optionalKeyFromEntry<
		k,
		def[k]
	>]?: def[k] extends OptionalValueTuple<infer baseDef> ?
		inferDefinition<baseDef, $, args>
	:	inferDefinition<def[k], $, args>
}

export type validateObjectLiteral<def, $, args> = {
	[k in keyof def]: preparseKey<k> extends (
		infer parsedKey extends PreparsedKey
	) ?
		k extends IndexKey<infer indexDef> ?
			validateString<indexDef, $, args> extends ErrorMessage<infer message> ?
				// add a nominal type here to avoid allowing the error message as input
				ErrorType<message>
			: inferDefinition<indexDef, $, args> extends Key ?
				// if the indexDef is syntactically and semantically valid,
				// move on to the validating the value definition
				validateDefinition<def[k], $, args>
			:	ErrorMessage<writeInvalidPropertyKeyMessage<indexDef>>
		:	validateEntry<def[k], parsedKey["kind"], $, args>
	:	never
}

type nonOptionalKeyFromEntry<k, v, $, args> =
	preparseKey<k> extends PreparsedEntryKey<"required", infer inner> ?
		v extends OptionalValueTuple ?
			never
		:	inner
	: preparseKey<k> extends PreparsedEntryKey<"index", infer inner> ?
		inferDefinition<inner, $, args> extends infer t extends Key ?
			t
		:	never
	:	// "..." is handled at the type root so is handled neither here nor in optionalKeyFrom
		// "+" has no effect on inference
		never

type optionalKeyFromEntry<key extends PropertyKey, v> =
	preparseKey<key> extends PreparsedEntryKey<"optional", infer name> ? name
	: v extends OptionalValueTuple ? key
	: never

export const writeInvalidUndeclaredBehaviorMessage = (
	actual: unknown
): string =>
	`Value of '+' key must be 'reject', 'delete', or 'ignore' (was ${printable(actual)})`

export const nonLeadingSpreadError =
	"Spread operator may only be used as the first key in an object"

export type PreparsedKey = PreparsedEntryKey | PreparsedSpecialKey

export type PreparsedEntryKey<
	kind extends EntryKeyKind = EntryKeyKind,
	key extends Key = Key
> = {
	kind: kind
	key: key
}

export type PreparsedSpecialKey<kind extends SpecialKeyKind = SpecialKeyKind> =
	{
		kind: kind
	}

declare namespace PreparsedKey {
	export type from<t extends PreparsedKey> = t
}

export type ParsedKeyKind = EntryKeyKind | SpecialKeyKind

export type EntryKeyKind = "required" | "optional" | "index"

export type SpecialKeyKind = "spread" | "undeclared"

export type MetaKey = "..." | "+"

export type IndexKey<def extends string = string> = `[${def}]`

export const preparseKey = (key: Key): PreparsedKey =>
	typeof key === "symbol" ? { kind: "required", key }
	: key.at(-1) === "?" ?
		key.at(-2) === escapeChar ?
			{ kind: "required", key: `${key.slice(0, -2)}?` }
		:	{
				kind: "optional",
				key: key.slice(0, -1)
			}
	: key[0] === "[" && key.at(-1) === "]" ?
		{ kind: "index", key: key.slice(1, -1) }
	: key[0] === escapeChar && key[1] === "[" && key.at(-1) === "]" ?
		{ kind: "required", key: key.slice(1) }
	: key === "..." ? { kind: "spread" }
	: key === "+" ? { kind: "undeclared" }
	: {
			kind: "required",
			key:
				key === "\\..." ? "..."
				: key === "\\+" ? "+"
				: key
		}

export type preparseKey<k> =
	k extends `${infer inner}?` ?
		inner extends `${infer baseName}${EscapeChar}` ?
			PreparsedKey.from<{
				kind: "required"
				key: `${baseName}?`
			}>
		:	PreparsedKey.from<{
				kind: "optional"
				key: inner
			}>
	: k extends "+" ? { kind: "undeclared" }
	: k extends "..." ? { kind: "spread" }
	: k extends `${EscapeChar}${infer escapedMeta extends MetaKey}` ?
		PreparsedKey.from<{ kind: "required"; key: escapedMeta }>
	: k extends IndexKey<infer def> ?
		PreparsedKey.from<{
			kind: "index"
			key: def
		}>
	:	PreparsedKey.from<{
			kind: "required"
			key: k extends `${EscapeChar}${infer escapedIndexKey extends IndexKey}` ?
				escapedIndexKey
			: k extends Key ? k
			: `${k & number}`
		}>

export const writeInvalidSpreadTypeMessage = <def extends string>(
	def: def
): writeInvalidSpreadTypeMessage<def> =>
	`Spread operand must resolve to an object literal type (was ${def})`

export type writeInvalidSpreadTypeMessage<def extends string> =
	`Spread operand must resolve to an object literal type (was ${def})`
