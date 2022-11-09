import type {
    DynamicState,
    initialBranches,
    stateFrom,
    StaticState
} from "../state/state.js"
import { initializeBranches } from "../state/state.js"

export const parseGroupOpen = (s: DynamicState) => {
    s.groups.push(s.branches)
    s.branches = initializeBranches()
    return s
}

export type parseGroupOpen<
    s extends StaticState,
    unscanned extends string
> = stateFrom<{
    groups: [...s["groups"], s["branches"]]
    branches: initialBranches
    root: undefined
    unscanned: unscanned
}>

export const unclosedGroupMessage = "Missing )"
export type unclosedGroupMessage = typeof unclosedGroupMessage
