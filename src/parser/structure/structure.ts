import type { Attributes } from "../../attributes/shared.js"
import type { array, dictionary } from "../../internal.js"
import type { Evaluate } from "../../utils/generics.js"
import type { DynamicParserContext, StaticParserContext } from "../common.js"
import { Root } from "../root.js"
import type { TupleExpression } from "./tupleExpression.js"
import { isTupleExpression, parseTupleExpression } from "./tupleExpression.js"

export namespace Structure {
    export type Definition = Kinds[Kind]

    export type Kinds = {
        dictionary: dictionary
        array: array
    }

    export type Kind = keyof Kinds

    export type parse<
        def,
        context extends StaticParserContext
    > = def extends TupleExpression
        ? parseTupleExpression<def, context>
        : Evaluate<{
              [K in keyof def]: Root.parse<def[K], context>
          }>

    export const parse = <kind extends Kind>(
        definition: Kinds[kind],
        kind: kind,
        context: DynamicParserContext
    ): Attributes => {
        const type = Array.isArray(definition) ? "array" : "dictionary"
        if (type === "array" && isTupleExpression(definition as array)) {
            return parseTupleExpression(definition as TupleExpression, context)
        }
        const props: dictionary<Attributes> = {}
        for (const k in definition) {
            context.path = pushKey(context.path, k)
            props[k] = Root.parse(definition[k], context) as any
            context.path = withoutLastKey(context.path)
        }
        return {
            type,
            props
        }
    }
}

const pushKey = (path: string, key: string, delimiter = ".") =>
    path === "" ? key : `${path}${delimiter}${key}`

const withoutLastKey = (path: string, delimiter = ".") => {
    const lastDelimiterIndex = path.lastIndexOf(delimiter)
    return lastDelimiterIndex === -1 ? "" : path.slice(0, lastDelimiterIndex)
}
