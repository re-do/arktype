import { configure } from "arktype/config"

export const config = configure({
	onFail: errors => errors.throw()
})
