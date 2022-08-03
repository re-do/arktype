import { assert } from "@re-/assert"
import { describe, test } from "mocha"
import { space } from "../../index.js"

describe("space", () => {
    test("single", () => {
        assert(space({ a: "string" }).$root.infer.a).typed as string
        assert(() =>
            // @ts-expect-error
            space({ a: "strig" }, { parse: { eager: true } })
        ).throwsAndHasTypeError("Unable to determine the type of 'strig'.")
    })
    test("independent", () => {
        assert(space({ a: "string", b: { c: "boolean" } }).$root.infer.b)
            .typed as {
            c: boolean
        }
        assert(() =>
            space(
                // @ts-expect-error
                { a: "string", b: { c: "uhoh" } },
                { parse: { eager: true } }
            )
        ).throwsAndHasTypeError("Unable to determine the type of 'uhoh'")
    })
    test("interdependent", () => {
        assert(space({ a: "string", b: { c: "a" } }).$root.infer.b.c)
            .typed as string
        assert(() =>
            // @ts-expect-error
            space({ a: "yikes", b: { c: "a" } }, { parse: { eager: true } })
        ).throwsAndHasTypeError("Unable to determine the type of 'yikes'")
    })
    test("cyclic", () => {
        const cyclicSpace = space({ a: { b: "b" }, b: { a: "a" } })
        // Type hint displays as any on hitting cycle
        assert(cyclicSpace.$root.infer.a).typed as {
            b: {
                a: {
                    b: {
                        a: any
                    }
                }
            }
        }
        // But still yields correct types when properties are accessed
        assert(cyclicSpace.$root.infer.b.a.b.a.b.a.b.a).typed as {
            b: {
                a: any
            }
        }
        // @ts-expect-error
        assert(cyclicSpace.$root.infer.a.b.a.b.c).type.errors.snap(
            `Property 'c' does not exist on type '{ a: { b: ...; }; }'.`
        )
    })
    test("cyclic eager", () => {
        const cyclicEagerSpace = space(
            { a: { b: "b" }, b: { a: "a" } },
            { parse: { eager: true } }
        )
        assert(cyclicEagerSpace.$root.infer.a).typed as {
            b: {
                a: {
                    b: {
                        a: any
                    }
                }
            }
        }
        assert(cyclicEagerSpace.a.validate({ b: {} }).error)
    })
    test("object list", () => {
        assert(space({ a: "string", b: [{ c: "a" }] }).$root.infer.b).typed as [
            {
                c: string
            }
        ]
    })
    test("doesn't try to validate any as a dictionary", () => {
        const parseWithAnySpace = space({} as any).$root.type({
            literal: "string",
            // @ts-ignore
            alias: "myType"
        })
        assert(parseWithAnySpace.infer).typed as {
            alias: unknown
            literal: string
        }
        assert(() =>
            parseWithAnySpace.validate({ literal: "", alias: "" })
        ).throws.snap(
            `Error: Unable to determine the type of 'myType' at path alias.`
        )
    })
    test("doesn't try to validate any as a dictionary member", () => {
        assert(space({ a: {} as any }).$root.type(["number", "a"]).infer)
            .typed as [number, any]
    })
    test("model from space", () => {
        const anotherCyclicSpace = space({ a: { b: "b" }, b: { a: "a" } })
        assert(anotherCyclicSpace.$root.type("a|b|null").infer).typed as
            | { b: { a: { b: { a: any } } } }
            | { a: { b: { a: { b: any } } } }
            | null
        assert(() =>
            anotherCyclicSpace.$root.type(
                // @ts-expect-error
                { nested: { a: "a", b: "b", c: "c" } },
                { parse: { eager: true } }
            )
        ).throwsAndHasTypeError("Unable to determine the type of 'c'")
    })
})
