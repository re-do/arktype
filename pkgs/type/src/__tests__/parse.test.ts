import { compile, parse, Validate } from ".."
import { expectType, expectError } from "tsd"
import { typeDefProxy } from "../common.js"

describe("parse", () => {
    test("built-in", () => {
        const result = parse("string").type
        expectType<string>(result)
        expect(() => {
            // @ts-expect-error
            parse("strig")
            // expectError<"Unable to determine the type of 'strig'.">(badResult)
        }).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of 'strig'."`
        )
    })
    test("string", () => {
        const result = parse("string|number[]?").type
        expectType<string | number[] | undefined>(result)
        expect(() => {
            // @ts-expect-error
            const badResult = parse("string|[]number")
            // expectError<"Unable to determine the type of '[]number'.">(
            //     badResult
            // )
        }).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of '[]number'."`
        )
    })
    test("string literals", () => {
        const stringLiteral = parse("'hello'")
        expectType<"hello">(stringLiteral.type)
        // As of TS 4.5, I don't think it's possible to parse a number literal from a string type
        // Runtime functionality like "getDefault" and "validate" will still use the more specific
        // value, but the TS type is inferred as "number"
        const numericStringLiteral = parse("4")
        expectType<number>(numericStringLiteral.type)
        const floatStringLiteral = parse("1.234")
        expectType<number>(floatStringLiteral.type)
    })
    // Using actual numbers solves the above type widening to "number",
    // but isn't available directly in the context of string types like lists or functions
    test("number literals", () => {
        const intLiteral = parse(0)
        expectType<0>(intLiteral.type)
        // Repeating, of course
        const floatLiteral = parse(32.33)
        expectType<32.33>(floatLiteral.type)
    })
    test("string function", () => {
        const result = parse("(string, number) => boolean[]")
        expectType<(x: string, y: number) => boolean[]>(result.type)
        const emptyFunction = parse("()=>void").type
        expectType<() => void>(emptyFunction)
        // @ts-expect-error
        expect(() => parse("()=>")).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of ''."`
        )
        expect(() =>
            // @ts-expect-error
            parse("(foop, string, nufmber) => boolean[]")
        ).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of 'foop'."`
        )
        // expectError<
        //     (
        //         args_0: "Unable to determine the type of 'foop'.",
        //         args_1: string,
        //         args_2: "Unable to determine the type of 'nufmber'."
        //     ) => boolean[]
        // >(badParameterResult.type)
        // @ts-expect-error
        expect(() => parse("()=>fork")).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of 'fork'."`
        )
        // expectError<() => "Unable to determine the type of 'fork'.">(
        //     badReturnResult.type
        // )
    })
    test("empty object", () => {
        const result = parse({})
        expectType<{}>(result)
    })
    test("object", () => {
        const result = parse({
            a: "string",
            b: "true|number?",
            c: { nested: "null[]" },
            d: 6
        })
        expectType<{
            a: string
            b?: true | number | undefined
            c: { nested: null[] }
            d: 6
        }>(result.type)
        expect(() =>
            // @ts-expect-error
            parse({ a: { b: "whoops" } })
        ).toThrowErrorMatchingInlineSnapshot(
            `"Unable to determine the type of 'whoops' at path a/b."`
        )
        // expectError<{
        //     a: {
        //         b: "Unable to determine the type of 'whoops'."
        //     }
        // }>(badResult.type)
    })
    test("bad type def type", () => {
        expect(() => {
            // @ts-expect-error
            const result = parse({ bad: true })
            expectError<{ bad: unknown }>(result.type)
        }).toThrowErrorMatchingInlineSnapshot(
            `"Definition value true at path bad is invalid. Definitions must be strings, numbers, or objects."`
        )
    })
    test("with typeset", () => {
        const stringResult = parse("borf", {
            typeSet: { borf: "boolean" }
        }).type
        expectType<boolean>(stringResult)
        const objectResult = parse(
            { snorf: "borf[]" },
            { typeSet: { borf: "boolean" } }
        )
        expectType<{ snorf: boolean[] }>(objectResult.type)
    })
    test("list definition", () => {
        const result = parse([{ a: "boolean" }, { b: "string?" }])
        expectType<[{ a: boolean }, { b?: string }]>(result.type)
        const nestedResult = parse({
            nestedList: ["string", { yes: "null|true" }]
        })
        expectType<{ nestedList: [string, { yes: null | true }] }>(
            nestedResult.type
        )
    })
    test("whitespace is ignored when parsing strings", () => {
        const stringResult = parse("    boolean      |    null       ").type
        expectType<boolean | null>(stringResult)
        const objectResult = parse({ nested: "number|    true" })
        expectType<{ nested: number | true }>(objectResult.type)
    })
    // test("extract types referenced from string", () => {
    //     type Extracted = Validate<
    //         "(user[],group[])=>boolean|number|null",
    //         UncompiledTypeSet<"user" | "group">
    //     >
    //     expectType<"number" | "boolean" | "user" | "group" | "null">(
    //         {} as Extracted
    //     )
    //     type WithoutBuiltIns = Validate<
    //         "(user[],group[])=>boolean|number|null",
    //         UncompiledTypeSet<"user" | "group">
    //     >
    //     expectType<"user" | "group">({} as WithoutBuiltIns)
    // })
    // test("extract base names of object", () => {
    //     type Def = Validate<
    //         {
    //             a: { b: { c: "user[]?" } }
    //             listed: [
    //                 "group|null",
    //                 "user|null",
    //                 "(string, number)=>function"
    //             ]
    //         },
    //         UncompiledTypeSet<"user" | "group">
    //     >
    //     expectType<{
    //         a: {
    //             b: {
    //                 c: "user"
    //             }
    //         }
    //         listed: [
    //             "group" | "null",
    //             "user" | "null",
    //             "string" | "number" | "function"
    //         ]
    //     }>({} as Def)
    // })
    const getCyclicTypeSet = () =>
        compile(
            { a: { b: "b", isA: "true", isB: "false" } },
            { b: { a: "a", isA: "false", isB: "true" } }
        )
    test("with onCycle option", () => {
        const result = getCyclicTypeSet().parse(
            { a: "a", b: "b" },
            {
                onCycle: {
                    cyclic: "cyclic?"
                }
            }
        )
        const cycleFromA = result.type.a.b.a.cyclic
        expectType<[true | undefined, false | undefined]>([
            cycleFromA?.isA,
            cycleFromA?.isB
        ])
        const cycleFromB = result.type.b.a.b.cyclic
        expectType<[false | undefined, true | undefined]>([
            cycleFromB?.isA,
            cycleFromB?.isB
        ])
        // After initial cycle, no more "cyclic" transformations occur since
        // "deepOnCycle" was not passed
        expectType<true | undefined>(cycleFromB?.a.b.a.b.a.b.a.b.isB)
    })
    test("with deepOnCycleOption", () => {
        const result = getCyclicTypeSet().parse(
            { a: "a", b: "b" },
            {
                deepOnCycle: true,
                onCycle: {
                    cyclic: "cyclic?"
                }
            }
        )
        const cycleFromB = result.type.a.b.a.cyclic?.b.a.b.cyclic
        expectType<[false | undefined, true | undefined]>([
            cycleFromB?.isA,
            cycleFromB?.isB
        ])
    })
    test("with onResolve option", () => {
        const result = getCyclicTypeSet().parse(
            {
                referencesA: "a",
                noReferences: {
                    favoriteSoup: "'borscht'"
                }
            },
            {
                onResolve: {
                    wasResolved: "true",
                    resolvedType: "resolved"
                }
            }
        )
        const AWasResolved = result.type.referencesA.wasResolved
        expectType<true>(AWasResolved)
        const deepBWasResolved =
            result.type.referencesA.resolvedType.b.wasResolved
        expectType<true>(deepBWasResolved)
        // @ts-expect-error
        result.type.noReferences.wasResolved
    })
    test("parse result", () => {
        const parseResult = parse("a", {
            typeSet: { a: "true" }
        })
        expect(parseResult.definition).toBe("a")
        expect(parseResult.typeSet).toStrictEqual({ a: "true" })
        expect(parseResult.assert(true)).toBe(undefined)
        expect(parseResult.check(true)).toBe("")
        expect(parseResult.check(true)).toBe("")
        expect(parseResult.generate()).toBe(true)
        expect(parseResult.type).toBe(typeDefProxy)
    })
})
