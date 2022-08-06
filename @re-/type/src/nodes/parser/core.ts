import { Get, Iterate } from "@re-/tools"
import { Base } from "../base/index.js"
import {
    Bound,
    Branches,
    Group,
    Intersection,
    List,
    Optional,
    Union
} from "../nonTerminal/index.js"
import { NumberLiteralNode, Terminal } from "../terminal/index.js"
import { ParseAffixes } from "./affix.js"
import { Expression } from "./common.js"
import { ErrorToken, suffixTokens } from "./tokens.js"

export namespace Core {
    export type Parse<Def extends string, Dict> = Get<
        ParseAffixes<Def, Dict>,
        "root"
    >

    export const parse = (def: string, ctx: Base.Parsing.Context) => {
        const s = Expression.initialize(def)
        parsePossiblePrefixes(s, ctx)
        parseExpression(s, ctx)
        reduceExpression(s)
        // @ts-ignore TODO: Allow parse functions to assert their state returned.
        parseSuffixes(s, ctx)
        return s.root!
    }

    const parsePossiblePrefixes = (
        s: Expression.State,
        ctx: Base.Parsing.Context
    ) => {
        parseToken(s, ctx)
        if (Expression.rootIs(s, NumberLiteralNode)) {
            Bound.parsePossibleLeft(s)
        }
    }

    export type ParseBase<
        S extends Expression.T.State,
        Unscanned extends unknown[],
        Dict
    > = S["root"] extends ErrorToken<string>
        ? S
        : Unscanned extends Iterate<infer Lookahead, infer Rest>
        ? Lookahead extends "("
            ? ParseBase<Group.ParseOpen<S>, Rest, Dict>
            : ParseOperator<Terminal.Parse<S, Lookahead, Dict>, Rest, Dict>
        : Expression.T.Error<S, `Expected an expression.`>

    type ParseOperator<
        S extends Expression.T.State,
        Unscanned extends unknown[],
        Dict
    > = S["root"] extends ErrorToken<string>
        ? S
        : Unscanned extends Iterate<infer Lookahead, infer Rest>
        ? Lookahead extends "[]"
            ? ParseOperator<List.Parse<S>, Rest, Dict>
            : Lookahead extends "|"
            ? ParseBase<Union.Parse<S>, Rest, Dict>
            : Lookahead extends "&"
            ? ParseBase<Intersection.Parse<S>, Rest, Dict>
            : Lookahead extends ")"
            ? ParseOperator<Group.ParseClose<S>, Rest, Dict>
            : Lookahead extends ErrorToken<string>
            ? Expression.T.SetRoot<S, Lookahead>
            : Expression.T.Error<
                  S,
                  // @ts-ignore TODO: Remove
                  `Expected an operator (got ${Lookahead}).`
              >
        : ReduceExpression<S>

    const parseExpression = (
        s: Expression.State,
        ctx: Base.Parsing.Context
    ) => {
        while (!(s.scanner.lookahead in suffixTokens)) {
            parseToken(s, ctx)
        }
    }

    const parseToken = (s: Expression.State, ctx: Base.Parsing.Context) => {
        switch (s.scanner.lookahead) {
            case "[]":
                return List.parse(s, ctx)
            case "|":
                return Union.parse(s, ctx)
            case "&":
                return Intersection.parse(s, ctx)
            case "(":
                return Group.parseOpen(s)
            case ")":
                return Group.parseClose(s)
            default:
                return Terminal.parse(s, ctx)
        }
    }

    export const UNCLOSED_GROUP_MESSAGE = "Missing )."
    type UnclosedGroupMessage = typeof UNCLOSED_GROUP_MESSAGE

    type ReduceExpression<S extends Expression.T.State> = ValidateExpression<
        Expression.T.From<{
            groups: S["groups"]
            branches: {}
            root: Branches.MergeAll<S["branches"], S["root"]>
        }>
    >

    const reduceExpression = (s: Expression.State) => {
        Branches.mergeAll(s)
        validateExpression(s)
    }

    type ValidateExpression<S extends Expression.T.State> =
        S["groups"] extends [] ? S : Expression.T.Error<S, UnclosedGroupMessage>

    const validateExpression = (s: Expression.State) => {
        if (s.groups.length) {
            throw new Error(UNCLOSED_GROUP_MESSAGE)
        }
    }

    const parseSuffixes = (
        s: Expression.WithRoot,
        ctx: Base.Parsing.Context
    ) => {
        while (s.scanner.lookahead !== "END") {
            parseSuffix(s, ctx)
        }
    }

    type UnexpectedSuffixMessage<Lookahead extends string> =
        `Unexpected suffix token '${Lookahead}'.`

    export const unexpectedSuffixMessage = <Lookahead extends string>(
        lookahead: Lookahead
    ): UnexpectedSuffixMessage<Lookahead> =>
        `Unexpected suffix token '${lookahead}'.`

    const parseSuffix = (s: Expression.WithRoot, ctx: Base.Parsing.Context) => {
        if (s.scanner.lookahead === "?") {
            Optional.parse(s, ctx)
        } else if (Expression.lookaheadIn(s, Bound.tokens)) {
            Bound.parseRight(s, ctx)
        } else {
            throw new Error(unexpectedSuffixMessage(s.scanner.lookahead))
        }
    }
}
