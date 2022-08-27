import { assert } from "@re-/assert"
import { before, describe, test } from "mocha"
import { type } from "../../../index.js"
import { incompleteTokenMessage } from "../list.js"

describe("list", () => {
    let list: ReturnType<typeof init>
    const init = () => type("string[]")
    before(() => {
        list = init()
    })
    test("parse", () => {
        assert(list.tree).typedValue(["string", "[]"])
    })
    describe("errors", () => {
        test("incomplete token", () => {
            // @ts-expect-error
            assert(() => type("string[")).throwsAndHasTypeError(
                incompleteTokenMessage
            )
        })
    })
    test("infer", () => {
        assert(list.infer).typed as string[]
    })
    describe("check", () => {
        test("empty", () => {
            assert(list.check([]).error).is(undefined)
        })
        test("singleton", () => {
            assert(list.check(["@re-/type"]).error).is(undefined)
        })
        test("multiple", () => {
            assert(list.check(["@re-/", "type"]).error).is(undefined)
        })
        describe("errors", () => {
            test("non-list", () => {
                assert(list.check({}).error?.message).snap(
                    `{} is not assignable to string[].`
                )
            })
            test("bad item", () => {
                assert(
                    list.check(["one", "two", 3, "four", "five"]).error?.message
                ).snap(`At index 2, 3 is not assignable to string.`)
            })
        })
    })
    describe("generation", () => {
        test("empty by default", () => {
            assert(list.create()).equals([])
        })
    })
})
