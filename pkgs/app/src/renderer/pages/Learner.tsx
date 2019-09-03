import React from "react"
import { component } from "blocks"
import {
    Column,
    Text,
    Spinner,
    TextInput,
    AppBar,
    usePalette,
    Icons,
    IconButton,
    ChipInput,
    ErrorText
} from "@re-do/components"
import { deactivateLearner, resetLearner, Page } from "state"
import { LearnerEvents } from "custom"
import gql from "graphql-tag"
import { useMutation } from "@apollo/react-hooks"
import { store } from "../common"

const SAVETEST = gql`
    mutation createTest(
        $name: String!
        $tags: [TagInput!]!
        $steps: [StepInput!]!
    ) {
        createTest(name: $name, tags: $tags, steps: $steps) {
            id
        }
    }
`

export type LearnerProps = {}

export const Learner = component({
    name: "Learner",
    defaultProps: {} as Partial<LearnerProps>,
    query: {
        learner: {
            events: null,
            chromiumInstalling: null,
            testName: null,
            testTags: null
        }
    }
})(({ data }) => {
    const {
        events,
        chromiumInstalling,
        testName: name,
        testTags: tags
    } = data.learner!
    const [saveTest, saveTestResult] = useMutation(SAVETEST)
    return (
        <Column full>
            <AppBar height={90} align="center">
                <Column align="center">
                    <TextInput
                        value={name}
                        placeholder="Test Name"
                        colorTemplate="light"
                        kind="underlined"
                        onChange={e =>
                            store.mutate({
                                learner: { testName: e.target.value }
                            })
                        }
                    />
                    <ChipInput
                        value={tags}
                        placeholder="Add Tags"
                        onAdd={(chip: string) =>
                            store.mutate({
                                learner: { testTags: _ => [..._, chip] }
                            })
                        }
                        onDelete={(chip: string) => {
                            store.mutate({
                                learner: {
                                    testTags: _ =>
                                        _.filter(current => current !== chip)
                                }
                            })
                        }}
                    />
                </Column>
            </AppBar>

            <div>
                {chromiumInstalling ? (
                    <Column align="center">
                        <Spinner />
                        <Text>Getting things ready...</Text>
                    </Column>
                ) : (
                    <LearnerEvents events={events} />
                )}
            </div>

            <AppBar kind="bottom" justify="space-around">
                <IconButton
                    Icon={Icons.close}
                    style={{ color: "white" }}
                    onClick={deactivateLearner}
                />
                {saveTestResult.loading ? (
                    <Spinner />
                ) : (
                    <>
                        <IconButton
                            Icon={Icons.save}
                            style={{ color: "white" }}
                            onClick={async () => {
                                await saveTest({
                                    variables: {
                                        name,
                                        tags: tags.map(_ => ({ name: _ })),
                                        steps: events.map(
                                            ({ __typename, ...inputs }: any) =>
                                                inputs
                                        )
                                    }
                                })
                                await resetLearner()
                                await store.mutate({ page: Page.Home })
                            }}
                        />
                        {saveTestResult.error ? (
                            <ErrorText>
                                {saveTestResult.error.message}
                            </ErrorText>
                        ) : null}
                    </>
                )}
            </AppBar>
        </Column>
    )
})
