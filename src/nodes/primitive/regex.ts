import { intersectUniqueLists, listFrom } from "../../../dev/utils/src/main.js"
import type { BaseNode } from "../node.js"
import { defineNodeKind } from "../node.js"

// converting a regex to a string alphabetizes the flags for us
export const serializeRegex = (regex: RegExp) =>
    `${regex}` as SerializedRegexLiteral

export type SerializedRegexLiteral = `/${string}/${string}`

export type RegexNode = BaseNode<SerializedRegexLiteral[]>

export const regexNode = defineNodeKind<
    RegexNode,
    SerializedRegexLiteral | SerializedRegexLiteral[]
>(
    {
        kind: "regex",
        parse: (input) => listFrom(input).sort(),
        compile: (rule, s) =>
            rule
                .map((literal) =>
                    s.check("regex", literal, `${literal}.test(${s.data})`)
                )
                .join("\n"),
        intersect: (l, r): RegexNode =>
            regexNode(intersectUniqueLists(l.rule, r.rule))
    },
    (base) => {
        const literals = base.rule.map((_) => `/${_}/`)
        const description =
            literals.length === 1
                ? literals[0]
                : `expressions ${literals.join(", ")}`
        return { description }
    }
)
