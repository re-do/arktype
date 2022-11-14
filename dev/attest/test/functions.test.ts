import { strict } from "node:assert"
import { basename } from "node:path"
import { describe, test } from "mocha"
import { fileName } from "../../runtime/exports.js"
import { attest } from "../exports.js"

const n = 5
const o = { re: "do" }
const shouldThrow = (a: false) => {
    if (a) {
        throw new Error(`${a} is not assignable to false`)
    }
}
const throwError = () => {
    throw new Error("Test error.")
}
describe("assertion errors", () => {
    test("valid type errors", () => {
        // @ts-expect-error
        attest(o.re.length.nonexistent).type.errors(
            /Property 'nonexistent' does not exist on type 'number'/
        )
        attest(o).type.errors("")
        // @ts-expect-error
        attest(() => shouldThrow(5, "")).type.errors.is(
            "Expected 1 arguments, but got 2."
        )
    })
    test("bad type errors", () => {
        strict.throws(
            () => attest(o).type.errors(/This error doesn't exist/),
            strict.AssertionError,
            "doesn't exist"
        )
        strict.throws(
            () =>
                attest(() =>
                    // @ts-expect-error
                    shouldThrow("this is a type error")
                ).type.errors.is(""),
            strict.AssertionError,
            "not assignable"
        )
    })
    test("chainable", () => {
        attest(o).equals({ re: "do" }).typed as { re: string }
        // @ts-expect-error
        attest(() => throwError("this is a type error"))
            .throws("Test error.")
            .type.errors("Expected 0 arguments, but got 1.")
    })
    test("bad chainable", () => {
        strict.throws(
            () =>
                attest(n)
                    .equals(5)
                    .type.errors.equals("Expecting an error here will throw"),
            strict.AssertionError,
            "Expecting an error"
        )
        strict.throws(
            () => attest(n).is(7).type.toString("string"),
            strict.AssertionError,
            "7"
        )
    })
    test("throwsAndHasTypeError", () => {
        // @ts-expect-error
        attest(() => shouldThrow(true)).throwsAndHasTypeError(
            /true[\S\s]*not assignable[\S\s]*false/
        )
        // No thrown error
        strict.throws(
            () =>
                // @ts-expect-error
                attest(() => shouldThrow(null)).throwsAndHasTypeError(
                    "not assignable"
                ),
            strict.AssertionError,
            "didn't throw"
        )
        // No type error
        strict.throws(
            () =>
                attest(() => shouldThrow(true as any)).throwsAndHasTypeError(
                    "not assignable"
                ),
            strict.AssertionError,
            "not assignable"
        )
    })
    test("throws empty", () => {
        attest(throwError).throws()
        strict.throws(
            () => attest(() => shouldThrow(false)).throws(),
            strict.AssertionError,
            "didn't throw"
        )
    })

    const getThrownError = (f: () => void) => {
        try {
            f()
        } catch (e) {
            if (e instanceof Error) {
                return e
            }
        }
        throw new Error("Expected function to throw an error.")
    }

    test("stack starts from test file", () => {
        const e = getThrownError(() => attest(1 + 1).equals(3))
        strict.match(e.stack!.split("\n")[1], new RegExp(basename(fileName())))
    })
})
