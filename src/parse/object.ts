import { intersection } from "../nodes/intersection.js"
import { morph } from "../nodes/morph.js"
import type { TypeNode } from "../nodes/node.js"
import { union } from "../nodes/union.js"
import type { ScopeRoot } from "../scope.js"
import { type } from "../type.js"
import { hasDomain } from "../utils/classify.js"
import { throwInternalError, throwParseError } from "../utils/errors.js"
import type {
    Dictionary,
    error,
    evaluate,
    keySet,
    List,
    mutable
} from "../utils/generics.js"
import { isKeyOf } from "../utils/generics.js"
import type { inferDefinition, validateDefinition } from "./definition.js"
import { parseDefinition } from "./definition.js"
import { Scanner } from "./reduce/scanner.js"
import { buildMissingRightOperandMessage } from "./shift/operand/unenclosed.js"

export const parseDict = (def: Dictionary, scope: ScopeRoot): TypeNode => {
    const props: mutable<Dictionary<TypeNode>> = {}
    const requiredKeys: mutable<keySet> = {}
    for (const definitionKey in def) {
        let keyName = definitionKey
        if (definitionKey.endsWith("?")) {
            keyName = definitionKey.slice(0, -1)
        } else {
            requiredKeys[definitionKey] = true
        }
        props[keyName] = parseDefinition(def[definitionKey], scope)
    }
    return {
        object: {
            props,
            requiredKeys
        }
    }
}

export type inferRecord<
    def extends Dictionary,
    scope extends Dictionary,
    aliases
> = evaluate<
    {
        [requiredKeyName in requiredKeyOf<def>]: inferDefinition<
            def[requiredKeyName],
            scope,
            aliases
        >
    } & {
        [optionalKeyName in optionalKeyOf<def>]?: inferDefinition<
            def[`${optionalKeyName}?`],
            scope,
            aliases
        >
    }
>

export const parseTuple = (def: List, scope: ScopeRoot): TypeNode => {
    if (isTokenedTupleExpression(def)) {
        return parseTokenedTupleExpression(def, scope)
    }
    if (isFunctionalTupleExpression(def)) {
        return parseFunctionalTupleExpression(def, scope)
    }
    const props: Record<number, TypeNode> = {}
    for (let i = 0; i < def.length; i++) {
        props[i] = parseDefinition(def[i], scope)
    }
    return {
        object: {
            kind: "Array",
            props
        }
    }
}

export type inferTuple<
    def extends List,
    scope extends Dictionary,
    aliases
> = def extends TokenedTupleExpression
    ? inferTokenedTupleExpression<def, scope, aliases>
    : def extends FunctionalTupleExpression
    ? inferFunctionalTupleExpression<def, scope, aliases>
    : {
          [i in keyof def]: inferDefinition<def[i], scope, aliases>
      }

export type validateTuple<
    def extends List,
    scope extends Dictionary
> = def extends TokenedTupleExpression
    ? validateTokenedTupleExpression<def, scope>
    : def extends FunctionalTupleExpression
    ? validateFunctionalTupleExpression<def, scope>
    : {
          [i in keyof def]: validateDefinition<def[i], scope>
      }

export type validateTupleExpression<
    def extends TupleExpression,
    scope extends Dictionary
> = def extends TokenedTupleExpression
    ? validateTokenedTupleExpression<def, scope>
    : // @ts-expect-error
      validateFunctionalTupleExpression<def, scope>

type optionalKeyWithName<name extends string = string> = `${name}?`

type optionalKeyOf<def> = {
    [k in keyof def]: k extends optionalKeyWithName<infer name> ? name : never
}[keyof def]

type requiredKeyOf<def> = {
    [k in keyof def]: k extends optionalKeyWithName ? never : k
}[keyof def]

export type validateTokenedTupleExpression<
    def extends TokenedTupleExpression,
    scope extends Dictionary
> = def[1] extends Scanner.BranchToken
    ? def[2] extends undefined
        ? error<buildMissingRightOperandMessage<def[1], "">>
        : [
              validateDefinition<def[0], scope>,
              def[1],
              validateDefinition<def[2], scope>
          ]
    : def[1] extends "[]"
    ? [validateDefinition<def[0], scope>, "[]"]
    : never

type inferTokenedTupleExpression<
    def extends TokenedTupleExpression,
    scope extends Dictionary,
    aliases
> = def[1] extends Scanner.BranchToken
    ? def[2] extends undefined
        ? never
        : def[1] extends "&"
        ? evaluate<
              inferDefinition<def[0], scope, aliases> &
                  inferDefinition<def[2], scope, aliases>
          >
        :
              | inferDefinition<def[0], scope, aliases>
              | inferDefinition<def[2], scope, aliases>
    : def[1] extends "[]"
    ? inferDefinition<def[0], scope, aliases>[]
    : never

type inferFunctionalTupleExpression<
    def extends FunctionalTupleExpression,
    scope extends Dictionary,
    aliases
> = def extends ConstraintTupleExpression
    ? inferDefinition<def[0], scope, aliases>
    : never

type validateFunctionalTupleExpression<
    def extends FunctionalTupleExpression,
    scope extends Dictionary
> = def extends ConstraintTupleExpression
    ? inferDefinition<def[0], scope, scope> extends infer constrained
        ? [validateDefinition<def[0], scope>, (data: constrained) => boolean]
        : never
    : never

const isFunctionalTupleExpression = (
    def: List
): def is FunctionalTupleExpression => typeof def[1] === "function"

const parseTokenedTupleExpression = (
    def: TokenedTupleExpression,
    scope: ScopeRoot
): TypeNode => {
    if (isKeyOf(def[1], Scanner.branchTokens)) {
        if (def[2] === undefined) {
            return throwParseError(buildMissingRightOperandMessage(def[1], ""))
        }
        const l = parseDefinition(def[0], scope)
        const r = parseDefinition(def[2], scope)
        return def[1] === "&" ? intersection(l, r, scope) : union(l, r, scope)
    }
    if (def[1] === "[]") {
        return morph("array", parseDefinition(def[0], scope))
    }
    return throwInternalError(`Unexpected tuple expression token '${def[1]}'`)
}

const parseFunctionalTupleExpression = (
    def: FunctionalTupleExpression,
    scope: ScopeRoot
): TypeNode => {
    if (def.length === 2) {
        const constrained = parseDefinition(def[0], scope)
        // TODO: Add constraint
        return constrained
    }
    return throwInternalError(
        `Unexpected functional tuple expression token '${def[1]}'`
    )
}

const isTokenedTupleExpression = (def: List): def is TokenedTupleExpression =>
    typeof def[1] === "string" && def[1] in tupleExpressionTokens

export type TupleExpression = TokenedTupleExpression | FunctionalTupleExpression

const tupleExpressionTokens = {
    "|": true,
    "&": true,
    "[]": true
} as const

type TupleExpressionToken = keyof typeof tupleExpressionTokens

export type TokenedTupleExpression = [
    unknown,
    TupleExpressionToken,
    ...unknown[]
]

export type FunctionalTupleExpression = [unknown, Function, ...unknown[]]

export type ConstraintTupleExpression = [unknown, Function]
