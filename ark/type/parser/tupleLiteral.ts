import {
	$ark,
	makeRootAndArrayPropertiesMutable,
	type BaseParseContext,
	type BaseRoot,
	type mutableInnerOfKind,
	type nodeOfKind,
	type Union
} from "@ark/schema"
import {
	append,
	isEmptyObject,
	throwParseError,
	type array,
	type conform,
	type ErrorMessage
} from "@ark/util"
import type { inferDefinition, validateDefinition } from "./definition.ts"
import { parseProperty, type OptionalPropertyDefinition } from "./property.ts"

export const parseTupleLiteral = (
	def: array,
	ctx: BaseParseContext
): BaseRoot => {
	let sequences: mutableInnerOfKind<"sequence">[] = [{}]
	let i = 0
	while (i < def.length) {
		let spread = false
		if (def[i] === "..." && i < def.length - 1) {
			spread = true
			i++
		}

		const { valueNode, kind } = parseProperty(def[i], ctx)

		i++
		if (spread) {
			if (!valueNode.extends($ark.intrinsic.Array))
				return throwParseError(writeNonArraySpreadMessage(valueNode.expression))

			// a spread must be distributed over branches e.g.:
			// def: [string, ...(number[] | [true, false])]
			// nodes: [string, ...number[]] | [string, true, false]
			sequences = sequences.flatMap(base =>
				// since appendElement mutates base, we have to shallow-ish clone it for each branch
				valueNode.distribute(branch =>
					appendSpreadBranch(makeRootAndArrayPropertiesMutable(base), branch)
				)
			)
		} else {
			sequences = sequences.map(base =>
				kind === "optional" ? appendOptionalElement(base, valueNode)
				: kind === "defaultable" ?
					appendDefaultableElement(base, valueNode, def[i])
				:	appendRequiredElement(base, valueNode)
			)
		}
	}

	return ctx.$.parseSchema(
		sequences.map(sequence =>
			isEmptyObject(sequence) ?
				{
					proto: Array,
					exactLength: 0
				}
			:	({
					proto: Array,
					sequence
				} as const)
		)
	)
}

export type validateTupleLiteral<def extends array, $, args> =
	parseSequence<def, $, args> extends infer s extends SequenceParseState ?
		Readonly<s["validated"]>
	:	never

export type inferTupleLiteral<def extends array, $, args> =
	parseSequence<def, $, args> extends infer s extends SequenceParseState ?
		s["inferred"]
	:	never

const appendRequiredElement = (
	base: mutableInnerOfKind<"sequence">,
	element: BaseRoot
): mutableInnerOfKind<"sequence"> => {
	if (base.optionals)
		// e.g. [string?, number]
		return throwParseError(requiredPostOptionalMessage)
	if (base.variadic) {
		// e.g. [...string[], number]
		base.postfix = append(base.postfix, element)
	} else {
		// e.g. [string, number]
		base.prefix = append(base.prefix, element)
	}
	return base
}

const appendOptionalElement = (
	base: mutableInnerOfKind<"sequence">,
	element: BaseRoot
): mutableInnerOfKind<"sequence"> => {
	if (base.optionals)
		// e.g. [string?, number]
		return throwParseError(requiredPostOptionalMessage)
	if (base.variadic) {
		// e.g. [...string[], number]
		base.postfix = append(base.postfix, element)
	} else {
		// e.g. [string, number]
		base.prefix = append(base.prefix, element)
	}
	return base
}

const appendVariadicElement = (
	base: mutableInnerOfKind<"sequence">,
	element: BaseRoot
): mutableInnerOfKind<"sequence"> => {
	// e.g. [...string[], number, ...string[]]
	if (base.postfix) throwParseError(multipleVariadicMesage)
	if (base.variadic) {
		if (!base.variadic.equals(element)) {
			// e.g. [...string[], ...number[]]
			throwParseError(multipleVariadicMesage)
		}
		// e.g. [...string[], ...string[]]
		// do nothing, second spread doesn't change the type
	} else {
		// e.g. [string, ...number[]]
		base.variadic = element.internal
	}
	return base
}

const appendSpreadBranch = (
	base: mutableInnerOfKind<"sequence">,
	branch: nodeOfKind<Union.ChildKind>
): mutableInnerOfKind<"sequence"> => {
	const spread = branch.firstReferenceOfKind("sequence")
	if (!spread) {
		// the only array with no sequence reference is unknown[]
		return appendVariadicElement(base, $ark.intrinsic.unknown)
	}

	spread.prefix?.forEach(node => appendRequiredElement(base, node))
	spread.optionals?.forEach(node => appendOptionalElement(base, node))
	if (spread.variadic) appendVariadicElement(base, spread.variadic)
	spread.postfix?.forEach(node => appendRequiredElement(base, node))

	return base
}

type SequenceParseState = {
	unscanned: array
	inferred: array
	validated: array
	includesOptional: boolean
}

type parseSequence<def extends array, $, args> = parseNextElement<
	{
		unscanned: def
		inferred: []
		validated: []
		includesOptional: false
	},
	$,
	args
>

type PreparsedElement = {
	head: unknown
	tail: array
	inferred: unknown
	validated: unknown
	optional: boolean
	spread: boolean
}

declare namespace PreparsedElement {
	export type from<result extends PreparsedElement> = result
}

type preparseNextState<s extends SequenceParseState, $, args> =
	s["unscanned"] extends readonly ["...", infer head, ...infer tail] ?
		preparseNextElement<head, tail, true, $, args>
	: s["unscanned"] extends readonly [infer head, ...infer tail] ?
		preparseNextElement<head, tail, false, $, args>
	:	null

type preparseNextElement<
	head,
	tail extends array,
	spread extends boolean,
	$,
	args
> =
	head extends OptionalPropertyDefinition<infer baseDef> ?
		PreparsedElement.from<{
			head: head
			tail: tail
			inferred: inferDefinition<baseDef, $, args>
			validated: OptionalPropertyDefinition<
				validateDefinition<baseDef, $, args, "optional">
			>
			// if inferredHead is optional and the element is spread, this will be an error
			// handled in nextValidatedSpreadElements
			optional: true
			spread: spread
		}>
	:	PreparsedElement.from<{
			head: head
			tail: tail
			inferred: inferDefinition<head, $, args>
			validated: validateDefinition<head, $, args, "required">
			optional: false
			spread: spread
		}>

type parseNextElement<s extends SequenceParseState, $, args> =
	preparseNextState<s, $, args> extends infer next extends PreparsedElement ?
		parseNextElement<
			{
				unscanned: next["tail"]
				inferred: nextInferred<s, next>
				validated: nextValidated<s, next>
				includesOptional: nextIncludesOptional<
					s["includesOptional"],
					next["optional"]
				>
			},
			$,
			args
		>
	:	s

type nextInferred<s extends SequenceParseState, next extends PreparsedElement> =
	next["spread"] extends true ?
		[...s["inferred"], ...conform<next["inferred"], array>]
	: next["optional"] extends true ? [...s["inferred"], next["inferred"]?]
	: [...s["inferred"], next["inferred"]]

type nextValidated<
	s extends SequenceParseState,
	next extends PreparsedElement
> = [
	...s["validated"],
	...nextValidatedSpreadOperatorIfPresent<s, next>,
	nextValidatedElement<s, next>
]

type nextValidatedSpreadOperatorIfPresent<
	s extends SequenceParseState,
	next extends PreparsedElement
> =
	next["spread"] extends true ?
		[
			next["inferred"] extends infer spreadOperand extends array ?
				[number, number] extends (
					[s["inferred"]["length"], spreadOperand["length"]]
				) ?
					ErrorMessage<multipleVariadicMessage>
				:	"..."
			:	ErrorMessage<writeNonArraySpreadMessage<next["head"]>>
		]
	:	[]

type nextValidatedElement<
	s extends SequenceParseState,
	next extends PreparsedElement
> =
	next["optional"] extends true ?
		next["spread"] extends true ? ErrorMessage<spreadOptionalMessage>
		: number extends s["inferred"]["length"] ?
			ErrorMessage<optionalPostVariadicMessage>
		:	next["validated"]
	: [s["includesOptional"], next["spread"]] extends [true, false] ?
		ErrorMessage<requiredPostOptionalMessage>
	:	next["validated"]

type nextIncludesOptional<
	includesOptional extends boolean,
	nextIsOptional extends boolean
> = includesOptional | nextIsOptional extends false ? false : true

export const writeNonArraySpreadMessage = <operand extends string>(
	operand: operand
): writeNonArraySpreadMessage<operand> =>
	`Spread element must be an array (was ${operand})` as never

type writeNonArraySpreadMessage<operand> =
	`Spread element must be an array${operand extends string ? ` (was ${operand})`
	:	""}`

export const multipleVariadicMesage =
	"A tuple may have at most one variadic element"

type multipleVariadicMessage = typeof multipleVariadicMesage

export const requiredPostOptionalMessage =
	"A required element may not follow an optional element"

type requiredPostOptionalMessage = typeof requiredPostOptionalMessage

export const optionalPostVariadicMessage =
	"An optional element may not follow a variadic element"

type optionalPostVariadicMessage = typeof optionalPostVariadicMessage

export const spreadOptionalMessage = "A spread element cannot be optional"

type spreadOptionalMessage = typeof optionalPostVariadicMessage
