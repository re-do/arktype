import { attest, contextualize } from "@ark/attest"
import { scope, type } from "arktype"
import { writeInvalidSpreadTypeMessage } from "arktype/internal/parser/objectLiteral.ts"

contextualize(() => {
	it("within scope", () => {
		const s = scope({
			user: { isAdmin: "false", name: "string" },
			admin: { "...": "user", isAdmin: "true" }
		}).export()

		attest<{ isAdmin: true; name: string }>(s.admin.infer)
		attest(s.admin.json).equals({
			domain: "object",
			required: [
				{ key: "isAdmin", value: { unit: true } },
				{ key: "name", value: "string" }
			]
		})
	})

	it("from another `type` call", () => {
		const user = type({ isAdmin: "false", name: "string" })
		const admin = type({ "...": user, isAdmin: "true" })

		attest<{ isAdmin: true; name: string }>(admin.infer)
		attest(admin.json).snap({
			domain: "object",
			required: [
				{ key: "isAdmin", value: { unit: true } },
				{ key: "name", value: "string" }
			]
		})
	})

	it("from an object literal", () => {
		// no idea why you'd want to do this
		const t = type({
			"...": {
				inherited: "boolean",
				overridden: "string"
			},
			overridden: "number"
		})

		attest<{
			inherited: boolean
			overridden: number
		}>(t.infer)

		attest(t.json).snap({
			domain: "object",
			required: [
				{
					key: "inherited",
					value: [{ unit: false }, { unit: true }]
				},
				{ key: "overridden", value: "number" }
			]
		})
	})

	it("escaped key", () => {
		const t = type({
			"\\...": "string"
		})

		attest<{ "...": string }>(t.infer)

		attest(t.json).snap({
			domain: "object",
			required: [{ key: "...", value: "string" }]
		})
	})

	it("with non-object", () => {
		// @ts-expect-error
		attest(() => type({ "...": "string" })).throwsAndHasTypeError(
			writeInvalidSpreadTypeMessage("string")
		)
	})

	// this is a regression test to ensure nodes are handled even if they aren't just an object
	it("with complex type", () => {
		const adminUser = type({
			"...": [{ name: "string" }, "&", { isAdmin: "false" }],
			isAdmin: "true"
		})

		attest<{ isAdmin: true; name: string }>(adminUser.infer)
		attest(adminUser.json).snap({
			domain: "object",
			required: [
				{ key: "isAdmin", value: { unit: true } },
				{ key: "name", value: "string" }
			]
		})
	})

	it("object keyword treated as empty", () => {
		const t = type({
			"...": "object",
			foo: "string"
		})

		attest<{
			foo: string
		}>(t.t)
		attest(t.expression).snap("{ foo: string }")
	})

	it("narrowed object keyword treated as empty", () => {
		const t = type({
			"...": type.object.narrow(() => true),
			foo: "string"
		})

		attest<{
			foo: string
		}>(t.t)
		attest(t.expression).snap("{ foo: string }")
	})

	it("errors on proto node", () => {
		attest(() =>
			type({
				"...": "Date",
				foo: "string"
			})
		).throws(writeInvalidSpreadTypeMessage("Date"))
	})

	it("autocompletes shallow string", () => {
		attest(() =>
			type({
				// @ts-expect-error
				"...": "objec"
			})
		).completions({
			objec: ["object"]
		})
	})

	it("autocompletes nested strings", () => {
		attest(() =>
			type({
				"...": {
					// @ts-expect-error
					inner: "boo"
				}
			})
		).completions({
			boo: ["boolean"]
		})
	})
})
