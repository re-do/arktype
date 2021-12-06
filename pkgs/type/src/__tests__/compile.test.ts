import { compile, parse } from ".."
import { expectType, expectError, printType } from "tsd"
import { typeDefProxy } from "../common.js"
import { assert } from "@re-do/assert"

describe("compile", () => {
    test("single", () => {
        assert(compile({ a: "string" }).types.a.type).typed as string
        assert(() => compile({ a: "strig" })).throwsAndHasTypeError(
            "Unable to determine the type of 'strig'."
        )
    })
    test("independent", () => {
        assert(compile({ a: "string" }, { b: { c: "boolean" } }).types.b.type)
            .typed as { c: boolean }
        assert(() =>
            compile({ a: "string" }, { b: { c: "uhoh" } })
        ).throwsAndHasTypeError("Unable to determine the type of 'uhoh'")
    })
    test("interdependent", () => {
        assert(compile({ a: "string" }, { b: { c: "a" } }).types.b.type.c)
            .typed as string
        assert(() =>
            compile({ a: "yikes" }, { b: { c: "a" } })
        ).throwsAndHasTypeError("Unable to determine the type of 'yikes'")
    })
    test("recursive", () => {
        // Recursive type displays any but calculates just-in-time for each property access
        assert(
            compile({ a: { dejaVu: "a?" } }).types.a.type.dejaVu?.dejaVu?.dejaVu
        ).type.toString.snap(`"{ dejaVu: any | undefined; } | undefined"`)
    })
    test("cyclic", () => {
        const { types } = compile({ a: { b: "b" } }, { b: { a: "a" } })
        // Type hint displays as any on hitting cycle
        assert(types.a.type).typed as {
            b: {
                a: {
                    b: {
                        a: any
                    }
                }
            }
        }
        // But still yields correct types when properties are accessed
        assert(types.b.type.a.b.a.b.a.b.a).typed as {
            b: {
                a: any
            }
        }
        assert(types.a.type.b.a.b.c).type.errors(
            "Property 'c' does not exist on type '{ a: { b: any; }; }'."
        )
    })
    test("object list", () => {
        const b = compile({ a: "string" }, { b: [{ c: "a" }] }).types.b.type
        expectType<{ c: string }[]>(b)
        // Can't pass in object list directly to compile
        // @ts-expect-error
        expect(() => compile([{ b: { c: "string" } }]))
            .toThrowErrorMatchingInlineSnapshot(`
            "Compile args must be a list of names mapped to their corresponding definitions
                        passed as rest args, e.g.:
                        compile(
                            { user: { name: \\"string\\" } },
                            { group: \\"user[]\\" }
                        )"
        `)
    })
    test("can parse from compiled types", () => {
        const { parse } = compile({ a: { b: "b" } }, { b: { a: "a" } })
        const result = parse("a|b|null").type
        expectType<{ b: { a: any } } | { a: { b: any } } | null>(result)
        expect(() =>
            // @ts-expect-error
            parse({ nested: { a: "a", b: "b", c: "c" } })
        ).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of 'c' at path nested/c."`
        )
        // expectError<{
        //     nested: {
        //         a: {
        //             b: {
        //                 a: any
        //             }
        //         }
        //         b: {
        //             a: any
        //         }
        //         c: "Unable to determine the type of 'c'."
        //     }
        // }>(badResult)
    })
    test("compile result", () => {
        const compileResult = compile({ a: { b: "b?" } }, { b: { a: "a?" } })
        const { type, ...parseResult } = compileResult.parse("a") as any
        expect(type).toBe(typeDefProxy)
        expect(parseResult).toMatchInlineSnapshot(`
            {
              "allows": [Function],
              "assert": [Function],
              "check": [Function],
              "definition": "a",
              "generate": [Function],
              "references": [Function],
              "typeSet": {
                "a": {
                  "b": "b?",
                },
                "b": {
                  "a": "a?",
                },
              },
            }
        `)
        const { type: preparsedType, ...preparsedResult } = compileResult.types
            .a as any
        expect(preparsedType).toBe(typeDefProxy)
        expect(preparsedResult).toMatchInlineSnapshot(`
            {
              "allows": [Function],
              "assert": [Function],
              "check": [Function],
              "definition": {
                "b": "b?",
              },
              "generate": [Function],
              "references": [Function],
              "typeSet": {
                "a": {
                  "b": "b?",
                },
                "b": {
                  "a": "a?",
                },
              },
            }
        `)
        // Make sure b is included in types without rechecking all of the above
        expect(typeof compileResult.types.b).toBe("object")
    })
})
