import { fileURLToPath } from "node:url"
import { caller, getCallStack } from "../../runtime/exports.js"
import { Assertions } from "./assertions/assertions.js"
import type { RootAssertions } from "./assertions/types.js"
import type { AtTestConfig, SourcePosition } from "./common.js"
import { getAtTestConfig } from "./common.js"

export type AssertFn = <T>(value: T) => RootAssertions<T, true>

export type AssertionContext = {
    actual: unknown
    originalAssertedValue: unknown
    cfg: AtTestConfig
    isReturn: boolean
    allowRegex: boolean
    position: SourcePosition
    defaultExpected?: unknown
    assertionStack: string
}

// @ts-ignore
export const attest: AssertFn = (
    value: unknown,
    internalConfigHooks?: Partial<AssertionContext>
) => {
    const position = caller()
    if (position.file.startsWith("file:///")) {
        position.file = fileURLToPath(position.file)
    }
    const ctx: AssertionContext = {
        actual: value,
        isReturn: false,
        allowRegex: false,
        originalAssertedValue: value,
        position,
        cfg: { ...getAtTestConfig(), ...internalConfigHooks },
        assertionStack: getCallStack({ offset: 1 }).join("\n")
    }
    return new Assertions(ctx)
}
