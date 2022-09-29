import type { ClassOf, InstanceOf } from "@re-/tools"
import type { Base } from "../../../nodes/base.js"
import type { NodeToString } from "../../../nodes/common.js"
import { parseError } from "../../common.js"
import type { UnclosedGroupMessage } from "../operand/groupOpen.js"
import { unclosedGroupMessage } from "../operand/groupOpen.js"
import type { UnpairedLeftBoundMessage } from "../operator/bound/left.js"
import { unpairedLeftBoundMessage } from "../operator/bound/left.js"
import type { Left } from "./left.js"
import { left } from "./left.js"
import type { OpenBranches } from "./openBranches.js"
import { scanner } from "./scanner.js"

export class parserState<constraints extends Partial<left> = {}> {
    l: left<constraints>
    r: scanner

    constructor(def: string) {
        this.l = left.initialize() as left<constraints>
        this.r = new scanner(def)
    }

    error(message: string): never {
        throw new parseError(message)
    }

    hasRoot<NodeClass extends ClassOf<Base.node> = ClassOf<Base.node>>(
        ofClass?: NodeClass
    ): this is parserState<{ root: InstanceOf<NodeClass> }> {
        return ofClass ? this.l.root instanceof ofClass : !!this.l.root
    }

    shifted() {
        this.r.shift()
        return this
    }

    finalize(): parserState.withRoot {
        return this.hasRoot()
            ? !this.l.groups.length
                ? this.l.branches.leftBound
                    ? this.error(
                          unpairedLeftBoundMessage(
                              this.l.root.toString(),
                              this.l.branches.leftBound[0].value,
                              this.l.branches.leftBound[1]
                          )
                      )
                    : this.reduceFinal()
                : this.error(unclosedGroupMessage)
            : this.error(expressionExpectedMessage(""))
    }

    reduceFinal(): parserState.withRoot {
        mergeBranches(this as parserState.withRoot)
        this.l.done = true
        return this as parserState.withRoot
    }
}

export namespace ParserState {
    export type Finalize<
        S extends ParserState,
        IsOptional extends boolean
    > = S["L"]["groups"] extends []
        ? S["L"]["branches"]["leftBound"] extends OpenBranches.OpenLeftBound
            ? ParserState.Error<
                  UnpairedLeftBoundMessage<
                      NodeToString<S["L"]["root"]>,
                      S["L"]["branches"]["leftBound"][0],
                      S["L"]["branches"]["leftBound"][1]
                  >
              >
            : From<{
                  L: {
                      lowerBound: null
                      groups: []
                      branches: {}
                      root: WrapIfOptional<
                          MergeBranches<S["L"]["branches"], S["L"]["root"]>,
                          IsOptional
                      >
                      done: true
                  }
                  R: ""
              }>
        : ParserState.Error<UnclosedGroupMessage>
}

type WrapIfOptional<Root, IsOptional extends boolean> = IsOptional extends true
    ? [Root, "?"]
    : Root

export namespace parserState {
    export type withRoot<Root extends Base.node = Base.node> = parserState<{
        root: Root
    }>
}

export type ParserState<Constraints extends Partial<Left> = {}> = {
    L: Left & Constraints
    R: string
}

export namespace ParserState {
    export type New<Def extends string> = From<{
        L: Left.New
        R: Def
    }>

    export type SetRoot<
        S extends ParserState,
        Node,
        ScanTo extends string = S["R"]
    > = From<{
        L: Left.SetRoot<S["L"], Node>
        R: ScanTo
    }>

    export type Of<L extends Left> = {
        L: L
        R: string
    }

    export type With<Constraints extends Partial<Left>> = {
        L: Left & Constraints
        R: string
    }

    export type From<S extends ParserState> = S

    export type Error<Message extends string> = {
        L: Left.Error<Message>
        R: ""
    }

    export type WithRoot<Root = {}> = Of<Left.WithRoot<Root>>

    export type Suffixable = {
        L: {
            nextSuffix: string
        }
    }
}

export type ExpressionExpectedMessage<Unscanned extends string> =
    `Expected an expression${Unscanned extends ""
        ? ""
        : ` before '${Unscanned}'`}.`

export const expressionExpectedMessage = <Unscanned extends string>(
    unscanned: Unscanned
) =>
    `Expected an expression${
        unscanned ? ` before '${unscanned}'` : ""
    }.` as ExpressionExpectedMessage<Unscanned>
