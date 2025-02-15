import { keysOf } from "@ark/util"
import { stdout } from "node:process"

export const cases = (cases: Record<string, () => unknown>) => {
	let failed = 0

	keysOf(cases).forEach(name => {
		stdout.write(name)
		try {
			cases[name]()
			stdout.write("✅\n")
		} catch (e) {
			stdout.write("❌\n")
			console.group()
			console.error(String(e))
			console.groupEnd()
			failed = 1
		}
	})

	if (failed) process.exit(failed)
}
