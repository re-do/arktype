import "./onFailConfig.ts"

import { type } from "arktype"
import { throws } from "node:assert/strict"
import { cases } from "./util.ts"

cases({
	throwsOnFail: () => {
		throws(() => {
			type.string(5)
		}, "must be a string (was number)")
	}
})
