import { isEmpty } from "../utils/deepEquals.js"
import type { keyOrSet, keySet, mutable } from "../utils/generics.js"
import { defineOperations } from "./attributes.js"

export const defineKeyOrSetOperations = <k extends string = string>() =>
    defineOperations<keyOrSet<k>>()({
        intersect: (a, b) =>
            typeof a === "string"
                ? typeof b === "string"
                    ? a === b
                        ? a
                        : ({ [a]: true, [b]: true } as keySet<k>)
                    : { ...b, [a]: true }
                : typeof b === "string"
                ? { ...a, [b]: true }
                : keySetOperations.intersect(a, b),
        extract: (a, b) =>
            typeof a === "string"
                ? typeof b === "string"
                    ? a === b
                        ? a
                        : null
                    : a in b
                    ? a
                    : null
                : typeof b === "string"
                ? b in a
                    ? b
                    : null
                : keySetOperations.extract(a, b),
        exclude: (a, b) =>
            typeof a === "string"
                ? typeof b === "string"
                    ? a === b
                        ? null
                        : a
                    : a in b
                    ? null
                    : a
                : keySetOperations.exclude(
                      a,
                      typeof b === "string" ? { [b]: true } : b
                  )
    })

export const stringKeyOrSetOperations = defineKeyOrSetOperations<string>()

export const keySetOperations = defineOperations<keySet>()({
    intersect: (a, b) => Object.assign(a, b),
    extract: (a, b) => {
        const result: mutable<keySet> = {}
        for (const k in a) {
            if (b[k]) {
                result[k] = true
            }
        }
        return isEmpty(result) ? null : result
    },
    exclude: (a, b) => {
        const result: mutable<keySet> = {}
        for (const k in a) {
            if (!b[k]) {
                result[k] = true
            }
        }
        return isEmpty(result) ? null : result
    }
})
