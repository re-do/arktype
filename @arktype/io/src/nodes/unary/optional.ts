import type { Base } from "../base/base.js"
import type { Traversal } from "../base/traversal.js"
import { Unary } from "./unary.js"

export namespace Optional {
    export class Node extends Unary.Node {
        readonly kind = "optional"

        constructor(public child: Base.Node) {
            super()
        }

        traverse(state: Base.Traversal) {
            if (state.data !== undefined) {
                this.child.traverse(state)
            }
        }

        toString() {
            return `${this.child.toString()}?` as const
        }

        tupleWrap(next: unknown) {
            return [next, "?"] as const
        }

        get mustBe() {
            return `${this.child.mustBe} if defined` as const
        }
    }
}
