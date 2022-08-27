import { assert } from "@re-/assert"
import { describe, test } from "mocha"
import { CustomValidator, def, space, type } from "../../index.js"

describe("custom validators", () => {
    const validator: CustomValidator = ({ value }) => {
        if (
            typeof value !== "string" ||
            value !== [...value].reverse().join("")
        ) {
            return `${value} is not a palindrome!`
        }
    }
    test("inline", () => {
        const palindrome = space({ palindrome: "string" }).$root.type(
            "palindrome",
            {
                validate: { validator }
            }
        )
        assert(palindrome.check("step on no pets").error).equals(undefined)
        assert(palindrome.check("step on your cat").error?.paths).equals({
            "": `step on your cat is not a palindrome!`
        })
    })
    test("model root", () => {
        const mySpace = space({
            palindrome: def("string", { validate: { validator } })
        })
        assert(mySpace.palindrome.check("redivider").error).is(undefined)
        assert(mySpace.palindrome.check("predivider").error?.message).is(
            `predivider is not a palindrome!`
        )
    })
    test("model nested", () => {
        const mySpace = space({
            palindrome: def("string", { validate: { validator } }),
            yourPal: { name: "palindrome" }
        })
        assert(mySpace.yourPal.check({ name: "bob" }).error).is(undefined)
        assert(mySpace.yourPal.check({ name: "rob" }).error?.message).snap(
            `At path name, rob is not a palindrome!`
        )
    })
    test("space", () => {
        const mySpace = space(
            {
                first: "1",
                second: "2"
            },
            {
                validate: {
                    validator: ({ def, value, getOriginalErrors }) => {
                        if (def === "first") {
                            return value === 1
                                ? undefined
                                : {
                                      "from/first": `${value} FAILED TO BE 1.`
                                  }
                        }
                        return getOriginalErrors()
                    }
                }
            }
        )
        assert(mySpace.first.check(1).error).is(undefined)
        assert(() => mySpace.first.assert(2)).throws.snap(
            `Error: At path from/first, 2 FAILED TO BE 1.`
        )
        assert(mySpace.$root.type("second").check(1).error?.message).snap(
            `1 is not assignable to 2.`
        )
    })
    test("can access standard validation errors and ctx", () => {
        const num = type("number", {
            validate: {
                validator: ({ getOriginalErrors, path }) => {
                    const errorMessages = Object.values(getOriginalErrors())
                    if (errorMessages.length) {
                        return {
                            [path]: errorMessages
                                .map((error) => `${error}!!!`)
                                .join("")
                        }
                    }
                    return {}
                }
            }
        })
        assert(num.check(7.43).error).is(undefined)
        assert(num.check("ssalbdivad").error?.message).snap(
            `"ssalbdivad" is not assignable to number.!!!`
        )
    })
})
