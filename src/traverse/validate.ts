import type { Scanner } from "../parse/state/scanner.js"
import type { dictionary } from "../utils/dynamicTypes.js"
import type { error, isAny } from "../utils/generics.js"
import type { inferAst } from "./infer.js"
import type { astToString } from "./toString.js"

export type validate<def, ast, scope extends dictionary> = def extends []
    ? def
    : ast extends error<infer message>
    ? message
    : def extends string
    ? checkAst<ast, scope> extends error<infer message>
        ? message
        : def
    : // @ts-expect-error We know K will also be in AST here because it must be structural
      { [k in keyof def]: validate<def[k], ast[k], scope> }

type checkAst<ast, scope extends dictionary> = ast extends string
    ? undefined
    : ast extends [infer child, unknown]
    ? checkAst<child, scope>
    : ast extends [infer left, infer token, infer right]
    ? token extends Scanner.BranchToken
        ? checkAst<left, scope> extends error<infer leftMessage>
            ? leftMessage
            : checkAst<right, scope> extends error<infer rightMessage>
            ? rightMessage
            : undefined
        : token extends Scanner.Comparator
        ? left extends number
            ? checkAst<right, scope>
            : isBoundable<inferAst<left, scope, {}>> extends true
            ? checkAst<left, scope>
            : error<buildUnboundableMessage<astToString<ast[0]>>>
        : token extends "%"
        ? isDivisible<inferAst<left, scope, {}>> extends true
            ? checkAst<left, scope>
            : error<buildIndivisibleMessage<astToString<ast[0]>>>
        : checkAst<left, scope>
    : undefined

type isNonLiteralNumber<t> = t extends number
    ? number extends t
        ? true
        : false
    : false

type isNonLiteralString<t> = t extends string
    ? string extends t
        ? true
        : false
    : false

type isDivisible<inferred> = isAny<inferred> extends true
    ? true
    : isNonLiteralNumber<inferred>

type isBoundable<inferred> = isAny<inferred> extends true
    ? true
    : isNonLiteralNumber<inferred> extends true
    ? true
    : isNonLiteralString<inferred> extends true
    ? true
    : inferred extends readonly unknown[]
    ? true
    : false

export const buildIndivisibleMessage = <root extends string>(
    root: root
): buildIndivisibleMessage<root> =>
    `Divisibility operand ${root} must be a non-literal number`

type buildIndivisibleMessage<root extends string> =
    `Divisibility operand ${root} must be a non-literal number`

export const buildUnboundableMessage = <root extends string>(
    root: root
): buildUnboundableMessage<root> =>
    `Bounded expression ${root} must be a non-literal number, string or array`

type buildUnboundableMessage<root extends string> =
    `Bounded expression ${root} must be a non-literal number, string or array`
