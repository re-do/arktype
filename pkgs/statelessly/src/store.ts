import {
    configureStore,
    Middleware,
    Store as ReduxStore,
    Reducer
} from "@reduxjs/toolkit"
import {
    DeepPartial,
    NonRecursible,
    Unlisted,
    updateMap,
    shapeFilter,
    ShapeFilter,
    DeepUpdate,
    AutoPath,
    valueAtPath,
    ValueAtPath,
    transform
} from "@re-do/utils"

export type Actions<T extends object> = Record<
    string,
    Update<T> | ((...args: any) => Update<T>)
>

export type StoreActions<T extends object, A extends Actions<T>> = {
    [K in keyof A]: A[K] extends (...args: any) => any
        ? (...args: Parameters<A[K]>) => void
        : () => void
}

export type Store<T extends object, A extends Actions<T>> = {
    underlying: ReduxStore<T, UpdateAction<T>>
    getState: () => T
    get: <P extends string>(path: AutoPath<T, P, "/">) => ValueAtPath<T, P>
    query: <Q extends Query<T>>(q: Q) => ShapeFilter<T, Q>
} & StoreActions<T, A>

export type StoreOptions<T> = {
    handler?: Handler<T, T> | Handle<T, T>
    middleware?: Middleware[]
}

export const createStore = <T extends object, A extends Actions<T>>(
    initial: T,
    actions: A,
    options: StoreOptions<T> = {}
): Store<T, A> => {
    const { handler, middleware } = options
    const rootReducer: Reducer<T, UpdateAction<T>> = (
        state: T | undefined,
        { type, payload }
    ) => {
        if (!state) {
            return initial
        }
        if (type !== "STATELESSLY") {
            return state
        }
        // Since payload has already been transformed by a prior updateMap call
        // in the action function, at this point all mapping functions have been
        // converted to their resultant serializable values
        return updateMap(state, payload as any)
    }
    const handle =
        typeof handler === "object" ? createHandler<T, T>(handler) : handler
    const reduxMiddleware = middleware ? [...middleware] : []
    if (handle) {
        reduxMiddleware.push(({ getState }) => (next) => (action) => {
            handle(action.payload, getState())
            return next(action)
        })
    }
    const reduxStore = configureStore({
        reducer: rootReducer,
        preloadedState: initial,
        middleware: reduxMiddleware
    })
    const storeActions = transform(actions, ([k, v]) => {
        const state = reduxStore.getState()
        if (typeof v === "function") {
            return [
                k,
                (...args: any) =>
                    reduxStore.dispatch({
                        type: "STATELESSLY",
                        payload: updateMap(state, v(...args))
                    })
            ]
        } else {
            return [
                k,
                () =>
                    reduxStore.dispatch({
                        type: "STATELESSLY",
                        payload: updateMap(state, v)
                    })
            ]
        }
    }) as any as StoreActions<T, A>
    return {
        ...storeActions,
        underlying: reduxStore,
        getState: reduxStore.getState,
        query: (q) => shapeFilter(reduxStore.getState(), q),
        // any types are a temporary workaround for excessive stack depth on type comparison error in TS
        get: ((path: any) => valueAtPath(reduxStore.getState(), path)) as any
    }
}

export const createHandler =
    <HandledState, RootState>(handler: Handler<HandledState, RootState>) =>
    async (changes: DeepPartial<HandledState>, context: RootState) => {
        for (const k in changes) {
            if (k in handler) {
                const handleKey = (handler as any)[k] as Handle<any, RootState>
                const keyChanges = (changes as any)[k] as DeepPartial<any>
                await handleKey(keyChanges, context)
            }
        }
    }

export type Query<T> = {
    [P in keyof T]?: Unlisted<T[P]> extends NonRecursible
        ? true
        : Query<Unlisted<T[P]>> | true
}

export type Update<T> = DeepUpdate<T>

export type Handle<HandledState, RootState> = (
    change: DeepPartial<HandledState>,
    context: RootState
) => void | Promise<void>

export type Handler<HandledState, RootState> = {
    [K in keyof HandledState]?: Handle<HandledState[K], RootState>
}

type UpdateAction<T> = {
    type: "STATELESSLY"
    payload: DeepPartial<T>
}
