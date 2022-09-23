import type { InstanceOf } from "@re-/tools"
import type { parseFn } from "../../../parser/common.js"
import type { Base } from "../../base.js"
import { AnyNode } from "./any.js"
import { BigintNode } from "./bigint.js"
import { BooleanNode } from "./boolean.js"
import { FunctionNode } from "./function.js"
import { NeverNode } from "./never.js"
import { NullNode } from "./null.js"
import type { NumberSubtypeKeyword } from "./number.js"
import { numberKeywords, NumberNode } from "./number.js"
import { ObjectNode } from "./object.js"
import type { StringSubtypeDefinition, StringSubtypeKeyword } from "./string.js"
import { StringNode, stringTypedKeywords } from "./string.js"
import { SymbolNode } from "./symbol.js"
import { UndefinedNode } from "./undefined.js"
import { UnknownNode } from "./unknown.js"
import { VoidNode } from "./void.js"

export const typeKeywords = {
    any: AnyNode,
    bigint: BigintNode,
    boolean: BooleanNode,
    function: FunctionNode,
    never: NeverNode,
    null: NullNode,
    number: NumberNode,
    object: ObjectNode,
    string: StringNode,
    symbol: SymbolNode,
    undefined: UndefinedNode,
    unknown: UnknownNode,
    void: VoidNode
}

export type TypeKeyword = keyof typeof typeKeywords

export type SubtypeKeyword = StringSubtypeKeyword | NumberSubtypeKeyword

export type SubtypeDefinition = StringSubtypeDefinition | NumberSubtypeKeyword

export type KeywordDefinition = keyof KeywordsToNodes

export type KeywordTypes = {
    [K in KeywordDefinition]: GetGeneratedType<InstanceOf<KeywordsToNodes[K]>>
}

export type InferKeyword<Definition extends KeywordDefinition> =
    KeywordTypes[Definition]

export const keywordNodes = {
    ...typeKeywords,
    ...stringTypedKeywords,
    ...numberKeywords
}

export const parseKeyword = (def: KeywordDefinition, context: Base.context) =>
    new keywordNodes[def](def as any, context)

export const matchesKeyword = (def: string): def is KeywordDefinition =>
    def in keywordNodes

type KeywordsToNodes = typeof keywordNodes

export type KeywordNode = InstanceOf<KeywordsToNodes[keyof KeywordsToNodes]>

type GetGeneratedType<N extends KeywordNode> = ReturnType<N["generate"]>
