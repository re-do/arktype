import React, { FC, useState } from "react"
import { Text, TextProps } from "../text"
import { useTheme, makeStyles, Theme } from "../styles"
import { ModalView } from "./ModalView"

export type ModalTextProps = TextProps & {}

export const ModalText: FC<ModalTextProps> = ({ ...rest }) => {
    const [open, setOpen] = useState(false)
    const theme = useTheme()
    return (
        <>
            <Text onClick={() => setOpen(true)} style={{}} noWrap {...rest} />
            <ModalView open={open} onClose={() => setOpen(false)} />
        </>
    )
}
