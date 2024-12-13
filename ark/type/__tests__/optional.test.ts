import { attest, contextualize } from "@ark/attest"
import { shallowOptionalMessage } from "arktype/internal/parser/ast/validate.ts"

contextualize(() => {
	it("no shallow default in tuple expression", () => {
		attest(() =>
			// @ts-expect-error
			type(["string?", "|", "number"])
		).throwsAndHasTypeError(shallowOptionalMessage)

		attest(() =>
			// @ts-expect-error
			type(["string", "|", ["number", "?"]])
		).throwsAndHasTypeError(shallowOptionalMessage)
	})

	it("no shallow default in scope", () => {
		// @ts-expect-error
		attest(() => scope({ foo: "string?" })).throwsAndHasTypeError(
			shallowOptionalMessage
		)

		// @ts-expect-error
		attest(() => scope({ foo: ["string", "?"] })).throwsAndHasTypeError(
			shallowOptionalMessage
		)
	})
})
