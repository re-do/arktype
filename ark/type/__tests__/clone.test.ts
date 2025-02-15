import { attest, contextualize } from "@ark/attest"
import { type } from "arktype"

contextualize(() => {
	it("preserves the original references if no morphs are present", () => {
		const t = type({
			foo: "string"
		})

		const original = { foo: "bar" }

		const out = t(original)
		attest(out).is(original)
	})

	it("clones by default before morphing", () => {
		const t = type({
			foo: "string.trim"
		})

		const original = { foo: "  bar  " }

		const out = t(original)

		attest(out).snap({ foo: "bar" })
		attest(original).snap({ foo: "  bar  " })
	})

	it("default clone implementation preserves prototypes", () => {
		const t = type(["Date", "=>", d => d.toISOString()])
		attest(t.from(new Date(2000, 1))).equals("2000-02-01T05:00:00.000Z")
	})

	it("can be configured to mutate", () => {
		const types = type.module(
			{
				trimAndMutate: { foo: "string.trim" }
			},
			{ clone: false }
		)

		const original = { foo: "  bar  " }

		const out = types.trimAndMutate(original)

		attest(out).snap({ foo: "bar" })
		attest(out).is(original)
	})

	it("can be configured to mutate", () => {
		const types = type.module(
			{
				trimAndMutate: { foo: "string.trim" }
			},
			{ clone: false }
		)

		const original = { foo: "  bar  " }

		const out = types.trimAndMutate(original)

		attest(out).snap({ foo: "bar" })
		attest(out).is(original)
	})

	it("can be configured to use a custom clone implementation", () => {
		const types = type.module(
			{
				trimAndMutate: { foo: "string.trim" }
			},
			{ clone: original => ({ ...original, customCloned: true }) }
		)

		const out = types.trimAndMutate({ foo: "  bar  " })

		attest(out).unknown.snap({ foo: "bar", customCloned: true })
	})

	// process.env is an exotic object- ensure it is correctly cloned
	// https://discord.com/channels/957797212103016458/1116551844710330458
	it("can clone process.env", () => {
		const env = type({
			"+": "delete",
			TZ: "'America/New_York'"
		})

		const originalEnv = { ...process.env }

		const vars = env(process.env)

		attest(vars).snap({ TZ: "America/New_York" })
		// if process.env is not spread here, the assertion fails apparently
		// because it's an exotic object? seems like a Node bug
		attest({ ...process.env }).equals(originalEnv)
	})
})
