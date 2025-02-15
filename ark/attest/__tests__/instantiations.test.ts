import { attest, contextualize } from "@ark/attest"
import { type } from "arktype"
import { it } from "mocha"

contextualize(() => {
	it("inline", () => {
		attest.instantiations([10000, "instantiations"])
		return type({
			kind: "'admin'",
			"powers?": "string[]"
		})
			.or({
				kind: "'superadmin'",
				"superpowers?": "string[]"
			})
			.or({
				kind: "'pleb'"
			})
	})
	it("fails on instantiations above threshold", () => {
		attest(() => {
			attest.instantiations([1, "instantiations"])
			return type({
				foo: "0|1|2|3|4|5|6"
			})
		}).throws("exceeded baseline by")
	})
})
