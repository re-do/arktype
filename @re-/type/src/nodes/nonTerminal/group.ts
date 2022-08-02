import type { Lexer } from "../parser/lexer.js"
import { ParserState } from "../parser/state.js"
import type { Branches } from "./branch/branch.js"

export namespace Group {
    export type ParseOpen<
        S extends ParserState.State,
        Dict
    > = ParserState.From<{
        L: {
            groups: [...S["L"]["groups"], S["L"]["branches"]]
            branches: {}
            root: null
            ctx: S["L"]["ctx"]
        }
        R: Lexer.ShiftBase<S["R"]["unscanned"], Dict>
    }>

    type PopGroup<
        Stack extends Branches.State[],
        Top extends Branches.State
    > = [...Stack, Top]

    export type ParseClose<S extends ParserState.State> =
        S["L"]["groups"] extends PopGroup<infer Stack, infer Top>
            ? ParserState.From<{
                  L: {
                      groups: Stack
                      root: Branches.MergeAll<
                          S["L"]["branches"],
                          S["L"]["root"]
                      >
                      branches: Top
                      ctx: S["L"]["ctx"]
                  }
                  R: Lexer.ShiftOperator<S["R"]["unscanned"]>
              }>
            : ParserState.Error<S, `Unexpected ).`>
}
