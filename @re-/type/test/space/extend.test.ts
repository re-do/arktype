import { assert } from "@re-/assert"
import { def, space } from "../../src/index.js"

describe("extend space", () => {
    it("type", () => {
        const extended = getExtendedSpace()
        assert(extended.$meta.infer).typed as {
            user: {
                first: string
                last: string
            }
            group: {
                members: {
                    first: string
                    last: string
                }[]
            }
            other: {
                groups: {
                    members: {
                        first: string
                        last: string
                    }[]
                }[]
                users: {
                    first: string
                    last: string
                }[]
            }
        }
    })
    it("dictionary", () => {
        const extended = getExtendedSpace()
        assert(extended.$meta.dictionary).snap({
            $meta: { onCycle: `boolean` },
            user: { first: `string`, last: `string` },
            group: {
                // @ts-expect-error (values returned from def() don't match their declared types by design)
                $def: { members: `user[]` },
                options: { validate: { ignoreExtraneousKeys: false } }
            },
            other: {
                // @ts-expect-error
                $def: { users: `user[]`, groups: `group[]` },
                options: { validate: { ignoreExtraneousKeys: true } }
            }
        })
    })
    it("options", () => {
        const extended = getExtendedSpace()
        assert(extended.$meta.options).snap({
            validate: {
                ignoreExtraneousKeys: false,
                // @ts-expect-error (can't serialize function)
                validator: `<function validator>`
            }
        })
    })
})

const getExtendedSpace = () => {
    const mySpace = space(
        {
            $meta: {
                onCycle: "number"
            },
            user: { name: "string" },
            group: def(
                { members: "user[]" },
                {
                    validate: {
                        ignoreExtraneousKeys: false
                    }
                }
            )
        },
        {
            validate: { ignoreExtraneousKeys: true, validator: () => undefined }
        }
    )
    const extended = mySpace.$meta.extend(
        {
            $meta: {
                onCycle: "boolean"
            },
            user: { first: "string", last: "string" },
            other: def(
                { users: "user[]", groups: "group[]" },
                {
                    validate: {
                        ignoreExtraneousKeys: true
                    }
                }
            )
        },
        {
            validate: {
                ignoreExtraneousKeys: false
            }
        }
    )
    return extended
}
