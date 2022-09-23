import { assert } from "@re-/assert"
import { narrow } from "@re-/tools"
import { describe, test } from "mocha"
import { type } from "../../../index.js"
import { unresolvableMessage } from "../../../parser/str/operand/unenclosed.js"
import type { Allows } from "../../allows.js"

describe("dictionary", () => {
    describe("infer", () => {
        test("base", () => {
            assert(
                type({
                    a: "0"
                }).infer
            ).typed as { a: 0 }
        })
        test("with optional key", () => {
            assert(
                type({
                    required: "boolean",
                    optional: "boolean?"
                }).infer
            ).typed as {
                required: boolean
                optional?: boolean | undefined
            }
        })
        test("empty", () => {
            assert(type({}).infer).typed as {}
        })
    })
    describe("empty", () => {
        const empty = type({})
        test("type", () => {
            assert(empty.infer).typed as {}
        })
        test("validation", () => {
            assert(empty.check({}).errors).is(undefined)
            assert(empty.check([]).errors?.summary).snap(
                "Must be a non-array object (was array)"
            )
        })
        test("generation", () => {
            assert(empty.create()).equals({})
        })
    })
    describe("check", () => {
        const shallowDef = narrow({
            a: "string",
            b: "number",
            c: "67"
        })
        const shallow = () => type(shallowDef)
        const nested = () => type({ nest: { ed: "string" } })
        test("standard", () => {
            assert(shallow().check({ a: "ok", b: 4.321, c: 67 }).errors).is(
                undefined
            )
        })
        test("nested", () => {
            assert(nested().check({ nest: { ed: "!" } }).errors).is(undefined)
        })
        describe("errors", () => {
            test("bad value", () => {
                assert(
                    shallow().check({ a: "ko", b: 123.4, c: 76 }).errors
                        ?.summary
                ).snap(`c must be 67 (was 76)`)
            })
            test("bad nested value", () => {
                assert(
                    nested().check({ nest: { ed: null } }).errors?.summary
                ).snap(`nest/ed must be a string (was null)`)
            })
            test("missing keys", () => {
                assert(
                    shallow().check({ a: "ok" })
                        .errors as any as Allows.Diagnostic<"missingKey">[]
                ).snap([
                    {
                        code: `missingKey`,
                        path: [],
                        context: { definition: `number`, key: `b` },
                        options: {},
                        message: `b is required`
                    },
                    {
                        code: `missingKey`,
                        path: [],
                        context: { definition: `67`, key: `c` },
                        options: {},
                        message: `c is required`
                    }
                ])
            })
            test("extraneous keys", () => {
                assert(
                    shallow().check(
                        {
                            a: "ok",
                            b: 4.321,
                            c: 67,
                            d: "extraneous",
                            e: "x-ray-knee-us"
                        },
                        {
                            diagnostics: {
                                extraneousKeys: { enabled: true }
                            }
                        }
                    ).errors as any as Allows.Diagnostic<"extraneousKeys">[]
                ).snap([
                    {
                        code: `extraneousKeys`,
                        path: [],
                        context: {
                            definition: shallowDef,
                            data: {
                                a: `ok`,
                                b: 4.321,
                                c: 67,
                                d: `extraneous`,
                                e: `x-ray-knee-us`
                            },
                            keys: [`d`, `e`]
                        },
                        options: { enabled: true },
                        message: `Keys 'd', 'e' were unexpected`
                    }
                ])
            })
            test("single extraneous", () => {
                assert(
                    shallow().check(
                        {
                            a: "",
                            b: 1,
                            c: 67,
                            extraneous: true
                        },
                        {
                            diagnostics: {
                                extraneousKeys: { enabled: true }
                            }
                        }
                    ).errors?.summary
                ).snap(`Key 'extraneous' was unexpected`)
            })
        })
    })
})

test("generate", () => {
    assert(type({ a: "string", b: { nested: "number" } }).create()).equals({
        a: "",
        b: { nested: 0 }
    })
})
