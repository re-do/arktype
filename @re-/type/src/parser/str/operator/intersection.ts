import { Intersection } from "../../../nodes/expression/intersection.js"
import type { MaybeAppend, MissingRightOperandMessage } from "../../common.js"
import type { ParserState, parserState } from "../state/state.js"

export namespace intersectionOperator {
    export const reduce = (s: parserState.WithRoot) => {
        if (!s.branches.intersection) {
            s.branches.intersection = new Intersection.Node([s.root])
        } else {
            s.branches.intersection.pushChild(s.root)
        }
        s.root = undefined as any
        return s
    }
}

export namespace IntersectionOperator {
    export type reduce<
        S extends ParserState.WithRoot,
        Unscanned extends string
    > = Unscanned extends ""
        ? ParserState.error<MissingRightOperandMessage<"&">>
        : ParserState.from<{
              root: null
              branches: {
                  leftBound: S["branches"]["leftBound"]
                  union: S["branches"]["union"]
                  intersection: [
                      MaybeAppend<S["root"], S["branches"]["intersection"]>,
                      "&"
                  ]
              }
              groups: S["groups"]
              unscanned: Unscanned
          }>
}

export namespace intersectionOperator {
    export const maybeMerge = (s: parserState.WithRoot) => {
        if (!s.branches.intersection) {
            return s
        }
        s.branches.intersection.pushChild(s.root)
        s.root = s.branches.intersection
        s.branches.intersection = undefined
        return s
    }
}
