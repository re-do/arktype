import { type CompilationState, In } from "../compilation.js"
import { Node } from "../node.js"

export class DivisorNode extends Node<"divisor"> {
    static readonly kind = "divisor"

    constructor(public divisor: number) {
        super("divisor", DivisorNode.compile(divisor))
    }

    static compile(divisor: number) {
        return `${In} % ${divisor} === 0`
    }

    compileTraverse(s: CompilationState) {
        return s.ifNotThen(this.condition, s.problem("divisor", this.divisor))
    }

    toString() {
        return `divisor ${this.divisor}`
    }

    intersectNode(r: DivisorNode) {
        const leastCommonMultiple = Math.abs(
            (this.divisor * r.divisor) /
                greatestCommonDivisor(this.divisor, r.divisor)
        )
        return new DivisorNode(leastCommonMultiple)
    }
}

// https://en.wikipedia.org/wiki/Euclidean_algorithm
const greatestCommonDivisor = (l: number, r: number) => {
    let previous
    let greatestCommonDivisor = l
    let current = r
    while (current !== 0) {
        previous = current
        current = greatestCommonDivisor % current
        greatestCommonDivisor = previous
    }
    return greatestCommonDivisor
}
