import { describe, it } from "mocha"
import { scope, type } from "../api.ts"
import { attest } from "../dev/attest/api.ts"
import {
    undiscriminatableMorphUnionMessage,
    writeDoubleMorphIntersectionMessage
} from "../src/parse/string/ast.ts"
import type { Out } from "../src/parse/tuple/morph.ts"
import type { Type } from "../src/type.ts"

describe("morph", () => {
    it("base", () => {
        const t = type(["boolean", "=>", (data) => `${data}`])
        attest(t.t).typed as Type<(In: boolean) => Out<string>>
        attest(t.infer).typed as Type<string>
        attest(t.node).snap({ input: "boolean", morph: "<function>" })
        attest(t(true).data).equals(true).typed as boolean
        attest(t(true).out).equals("true").typed as string
        attest(t("foo").problems?.summary).snap()
    })
    it("endomorph", () => {
        const t = type(["boolean", "=>", (data) => !data])
        attest(t.t).typed as Type<(In: boolean) => Out<boolean>>
        attest(t(true).data).equals(true).typed as boolean
        attest(t(true).out).equals(false).typed as boolean
    })
    it("object inference", () => {
        const t = type([{ a: "string" }, "=>", (data) => `${data}`])
        attest(t.t).typed as Type<(In: { a: string }) => Out<string>>
    })
    it("intersection", () => {
        const types = scope({
            a: ["number", "=>", (data) => `${data}`, "string"],
            b: "3.14",
            aAndB: "a&b",
            bAndA: "b&a"
        })
        attest(types.aAndB).typed as Type<(In: 3.14) => Out<string>>
        attest(types.aAndB.node).snap({
            input: { number: { value: 3.14 } },
            morph: "<function>"
        })
        attest(types.bAndA).typed as typeof types.aAndB
        attest(types.bAndA.node).equals(types.aAndB.node)
    })
    it("object interesection", () => {
        const types = scope({
            a: [{ a: "1" }, "=>", (data) => `${data}`, "string"],
            b: { b: "2" },
            c: "a&b"
        })
        attest(types.c).typed as Type<(In: { a: 1; b: 2 }) => Out<string>>
        attest(types.c.node).snap({
            input: {
                object: {
                    props: {
                        a: { number: { value: 1 } },
                        b: { number: { value: 2 } }
                    }
                }
            },
            morph: "<function>"
        })
    })
    it("union", () => {
        const types = scope({
            a: ["number", "=>", (data) => `${data}`],
            b: "boolean",
            aOrB: "a|b",
            bOrA: "b|a"
        })
        attest(types.aOrB).typed as Type<(In: number | boolean) => Out<string>>
        attest(types.aOrB.node).snap({ input: {}, morph: "<function>" })
        attest(types.bOrA).typed as typeof types.aOrB
        attest(types.bOrA.node).equals(types.aOrB.node)
    })
    it("deep intersection", () => {
        const types = scope({
            a: { a: ["number>0", "=>", (data) => data + 1] },
            b: { a: "1" },
            c: "a&b"
        })
        attest(types.c).typed as Type<{
            a: (In: 1) => Out<number>
        }>
        attest(types.c.node).snap({
            object: {
                props: {
                    a: {
                        input: { number: { value: 1 } },
                        morph: "<function>" as any
                    }
                }
            }
        })
    })
    it("deep union", () => {
        const types = scope({
            a: { a: ["number>0", "=>", (data) => `${data}`] },
            b: { a: "Function" },
            c: "a|b"
        })
        attest(types.c).typed as Type<
            | {
                  a: (In: number) => Out<string>
              }
            | {
                  a: Function
              }
        >
        attest(types.c.node).snap({})
    })
    it("chained", () => {
        const types = scope({
            a: ["string", "=>", (s) => s.length, "number"],
            b: ["a", "=>", (n) => n === 0]
        })
        attest(types.b).typed as Type<(In: string) => Out<boolean>>
        attest(types.b.node).snap({
            input: "string",
            morph: ["<function>", "<function>"]
        })
    })
    it("chained nested", () => {
        const types = scope({
            a: ["string", "=>", (s) => s.length, "number"],
            b: [{ a: "a" }, "=>", ({ a }) => a === 0, "boolean"]
        })
        attest(types.b).typed as Type<(In: { a: string }) => Out<boolean>>
        attest(types.b.node).snap({
            input: { object: { props: { a: "a" } } },
            morph: "<function>"
        })
    })
    it("discriminatable tuple union", () => {
        const types = scope({
            a: [["string"], "=>", (s) => [...s, "!"], "string[]"],
            b: ["boolean"],
            c: "a|b"
        })
        attest(types.c).typed as Type<
            [boolean] | ((In: [string]) => Out<string[]>)
        >
        attest(types.c.node).snap({
            object: [
                {
                    subdomain: ["Array", "unknown", 1],
                    props: { "0": "string" }
                },
                {
                    subdomain: ["Array", "unknown", 1],
                    props: { "0": "boolean" }
                }
            ]
        })
    })
    it("double intersection", () => {
        attest(() => {
            scope({
                a: ["boolean", "=>", (data) => `${data}`],
                b: ["boolean", "=>", (data) => `${data}!!!`],
                // @ts-expect-error
                c: "a&b"
            })
        }).throwsAndHasTypeError(writeDoubleMorphIntersectionMessage([]))
    })
    it("undiscriminated union", () => {
        attest(() => {
            scope({
                a: ["/.*/", "=>", (s) => s.trim()],
                b: "string",
                // @ts-expect-error
                c: "a|b"
            })
        }).throwsAndHasTypeError(undiscriminatableMorphUnionMessage)
    })
    it("deep double intersection", () => {
        attest(() => {
            scope({
                a: { a: ["boolean", "=>", (data) => `${data}`] },
                b: { a: ["boolean", "=>", (data) => `${data}!!!`] },
                // @ts-expect-error
                c: "a&b"
            })
        }).throwsAndHasTypeError(writeDoubleMorphIntersectionMessage(["a"]))
    })
    it("deep undiscriminated union", () => {
        attest(() => {
            scope({
                a: { a: ["string", "=>", (s) => s.trim()] },
                b: { a: "'foo'" },
                // @ts-expect-error
                c: "a|b"
            })
        }).throwsAndHasTypeError(undiscriminatableMorphUnionMessage)
    })
    it("array double intersection", () => {
        attest(() => {
            scope({
                a: { a: ["number>0", "=>", (data) => data + 1] },
                b: { a: ["number>0", "=>", (data) => data + 1] },
                // @ts-expect-error
                c: "a[]&b[]"
            })
        }).throwsAndHasTypeError(
            writeDoubleMorphIntersectionMessage(["${number}", "a"])
        )
    })
})
