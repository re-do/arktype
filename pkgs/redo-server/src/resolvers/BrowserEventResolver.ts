import { Authorized, Ctx, Mutation, Query, Resolver, Args } from "type-graphql"
import { Test, TestInput, BrowserEvent, BrowserEventInput } from "redo-model"
import { Context } from "../context"
import { createTagsInput } from "./common"
@Resolver(of => BrowserEvent)
export class BrowserEventResolver {
    @Authorized()
    @Mutation(returns => String)
    async submitBrowserEvent(
        @Args() { type, selector, value, tags }: BrowserEventInput,
        @Ctx() { photon, id }: Context
    ) {
        const test = await photon.browserEvents.create({
            data: {
                type,
                selector,
                value,
                tags: { create: createTagsInput(tags, id!) },
                user: { connect: { id: id! } }
            }
        })
        return test.id
    }
    @Authorized()
    @Query(returns => [BrowserEvent])
    async getBrowserEvent(@Ctx() { photon, id }: Context) {
        const results = await photon.browserEvents.findMany({
            where: { user: { id: id! } },
            include: { tags: true, user: true }
        })
        return results
    }
}
