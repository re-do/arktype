import { cached } from "../utils/functions.js"
import type { ClassNode } from "./basis/class.js"
import { classNode } from "./basis/class.js"
import type { DomainNode } from "./basis/domain.js"
import { domainNode } from "./basis/domain.js"
import type { ValueNode } from "./basis/value.js"
import { valueNode } from "./basis/value.js"
import { propsNode } from "./deep/props.js"
import type { PropsNode } from "./deep/props.js"
import type { NodeConstructor } from "./node.js"
import type { PredicateNode } from "./predicate.js"
import { predicateNode } from "./predicate.js"
import type { DivisorNode } from "./shallow/divisor.js"
import { divisorNode } from "./shallow/divisor.js"
import type { MorphNode } from "./shallow/morph.js"
import { morphNode } from "./shallow/morph.js"
import type { NarrowNode } from "./shallow/narrow.js"
import { narrowNode } from "./shallow/narrow.js"
import type { RangeNode } from "./shallow/range.js"
import { rangeNode } from "./shallow/range.js"
import type { RegexNode } from "./shallow/regex.js"
import { regexNode } from "./shallow/regex.js"
import type { TypeNode } from "./type.js"
import { typeNode } from "./type.js"

export const precedenceByKind = {
    // roots
    type: 0,
    predicate: 0,
    // basis checks
    domain: 1,
    class: 1,
    value: 1,
    // shallow checks
    range: 2,
    divisor: 2,
    regex: 2,
    // deep checks
    props: 3,
    // narrows
    narrow: 4,
    // morphs
    morph: 5
} as const satisfies Record<NodeKind, number>

export type NodeKinds = {
    type: TypeNode
    predicate: PredicateNode
    domain: DomainNode
    class: ClassNode
    value: ValueNode
    range: RangeNode
    divisor: DivisorNode
    regex: RegexNode
    props: PropsNode
    narrow: NarrowNode
    morph: MorphNode
}

export type NodeKind = keyof NodeKinds

const nodeKinds = cached(
    () =>
        ({
            type: typeNode,
            predicate: predicateNode,
            domain: domainNode,
            class: classNode,
            value: valueNode,
            range: rangeNode,
            divisor: divisorNode,
            regex: regexNode,
            props: propsNode,
            narrow: narrowNode,
            morph: morphNode
        } satisfies { [k in NodeKind]: NodeConstructor<NodeKinds[k], never> })
)

type NodeConstructors = { [k in NodeKind]: ReturnType<typeof nodeKinds>[k] }

export type NodeInputs = { [k in NodeKind]: Parameters<NodeConstructors[k]>[0] }

export const createNodeOfKind = <kind extends NodeKind>(
    kind: kind,
    input: NodeInputs[kind]
) => nodeKinds()[kind](input as never) as NodeKinds[kind]
