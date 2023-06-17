import { suite, test } from "mocha"
import { type } from "../../src/main.js"
import { attest } from "../attest/main.js"

suite("object literal", () => {
    test("empty", () => {
        const o = type({})
        attest(o.condition).equals(type("object").condition)
    })
    test("required", () => {
        const o = type({ a: "string", b: "boolean" })
        attest(o.infer).typed as { a: string; b: boolean }
    })
    test("optional keys", () => {
        const o = type({ "a?": "string", b: "boolean" })
        attest(o.infer).typed as { a?: string; b: boolean }
    })
    test("index", () => {
        const o = type({ "[string]": "string" })
        attest(o).typed as { [x: string]: string }
    })
    test("enumerable indexed union", () => {
        const o = type({ "['foo' | 'bar']": "string" })
        attest(o).typed as {
            foo: string
            bar: string
        }
    })
    test("non-enumerable indexed union", () => {
        const o = type({ "[string | number]": "string" })
        attest(o).typed as {
            [x: string]: string
            [x: number]: string
        }
    })
    test("multiple indexed", () => {
        const o = type({
            "[string]": "string | number",
            "[number]": "number"
        })
        attest(o).typed as {
            [x: string]: string | number
            [x: number]: number
        }
    })
    test("all key kinds", () => {
        const o = type({
            "[string]": "string",
            required: "'foo'",
            "optional?": "'bar'"
        })
        attest(o.infer).typed as {
            [x: string]: string
            required: "foo"
            optional?: "bar"
        }
    })

    test("nested", () => {
        const t = type({ "a?": { b: "boolean" } })
        attest(t.infer).typed as { a?: { b: boolean } }
    })
    test("intersections", () => {
        const a = { "a?": "string" } as const
        const b = { b: "string" } as const
        const c = { "c?": "string" } as const
        const abc = type(a).and(b).and(c)
        attest(abc.infer).typed as {
            a?: string
            b: string
            c?: string
        }
        attest(abc.condition).equals(type({ ...a, ...b, ...c }).condition)
        attest(abc.condition).equals(type([[a, "&", b], "&", c]).condition)
    })
    test("traverse optional", () => {
        const o = type({ "a?": "string" }).configure({ keys: "strict" })
        attest(o({ a: "a" }).data).snap({ a: "a" })
        attest(o({}).data).snap({})
        attest(o({ a: 1 }).problems?.summary).snap(
            "a must be a string (was number)"
        )
    })
    test("intersection", () => {
        const t = type({ a: "number" }).and({ b: "boolean" })
        // Should be simplified from {a: number} & {b: boolean} to {a: number, b: boolean}
        attest(t.infer).types.toString.snap("{ a: number; b: boolean; }")
        attest(t.condition).is(type({ a: "number", b: "boolean" }).condition)
    })
    test("escaped optional token", () => {
        const t = type({ "a\\?": "string" })
        attest(t.infer).typed as { "a?": string }
    })
    test("escaped index", () => {
        const o = type({ "\\[string]": "string" })
        attest(o.infer).typed as { "[string]": string }
    })
    test("multiple bad strict", () => {
        const t = type({ a: "string", b: "boolean" }).configure({
            keys: "strict"
        })
        attest(t({ a: 1, b: 2 }).problems?.summary).snap(
            "a must be a string (was number)\nb must be boolean (was number)"
        )
    })
})
