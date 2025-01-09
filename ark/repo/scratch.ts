import { type } from "arktype"
import { buildApi, jsdocGen } from "./jsdocGen.ts"

// type stats on attribute removal merge 12/18/2024
// {
//     "checkTime": 10.98,
//     "types": 409252,
//     "instantiations": 5066185
// }

const t = type("(number % 2) > 0")

buildApi()
