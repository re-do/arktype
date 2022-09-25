import { isKeyOf } from "@re-/tools"
import type { parseContext } from "../../common.js"
import type { Left } from "../state/left.js"
import type { Scanner } from "../state/scanner.js"
import type { parserState, ParserState } from "../state/state.js"
import type { ParseArray } from "./array.js"
import { parseArray } from "./array.js"
import type { ComparatorChar } from "./bound/common.js"
import { comparatorChars } from "./bound/common.js"
import type { ParseBound } from "./bound/parse.js"
import { parseBound } from "./bound/parse.js"
import type { ReduceIntersection } from "./branch/intersection.js"
import { reduceIntersection } from "./branch/intersection.js"
import type { ReduceUnion } from "./branch/union.js"
import { reduceUnion } from "./branch/union.js"
import type { ReduceGroupClose } from "./groupClose.js"
import { reduceGroupClose } from "./groupClose.js"

export const parseOperator = (
    s: parserState.withRoot,
    context: parseContext
): parserState => {
    const lookahead = s.r.shift()
    return lookahead === "END"
        ? s.suffixed("END")
        : lookahead === "?"
        ? s.suffixed("?")
        : lookahead === "["
        ? parseArray(s, context)
        : lookahead === "|"
        ? reduceUnion(s, context)
        : lookahead === "&"
        ? reduceIntersection(s, context)
        : lookahead === ")"
        ? reduceGroupClose(s)
        : isKeyOf(lookahead, comparatorChars)
        ? parseBound(s, lookahead)
        : lookahead === " "
        ? parseOperator(s, context)
        : s.error(unexpectedCharacterMessage(lookahead))
}

export type ParseOperator<S extends ParserState> = S["R"] extends Scanner.Shift<
    infer Lookahead,
    infer Unscanned
>
    ? Lookahead extends "?"
        ? ParserState.From<{
              L: Left.SetNextSuffix<S["L"], "?">
              R: Unscanned
          }>
        : Lookahead extends "["
        ? ParseArray<S, Unscanned>
        : Lookahead extends "|"
        ? ParserState.From<{
              L: ReduceUnion<S["L"]>
              R: Unscanned
          }>
        : Lookahead extends "&"
        ? ParserState.From<{
              L: ReduceIntersection<S["L"]>
              R: Unscanned
          }>
        : Lookahead extends ")"
        ? ParserState.From<{
              L: ReduceGroupClose<S["L"], Unscanned>
              R: Unscanned
          }>
        : Lookahead extends ComparatorChar
        ? ParseBound<S, Lookahead, Unscanned>
        : Lookahead extends " "
        ? ParseOperator<{ L: S["L"]; R: Unscanned }>
        : ParserState.Error<UnexpectedCharacterMessage<Lookahead>>
    : ParserState.From<{
          L: Left.SetNextSuffix<S["L"], "END">
          R: ""
      }>

const unexpectedCharacterMessage = <Char extends string>(
    char: Char
): UnexpectedCharacterMessage<Char> => `Unexpected character '${char}'.`

type UnexpectedCharacterMessage<Char extends string> =
    `Unexpected character '${Char}'.`
