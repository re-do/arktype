"use client"

import { motion } from "framer-motion"
import { useLayoutEffect, useMemo, useState } from "react"
import { BoatIcon } from "./icons/boat.tsx"

const BOB_HEIGHT_PX = 2
const BOB_WIDTH_PX = 16

export type FloatYourBoatProps = {
	kind: "header" | "banner"
}

const selectorsByKind = {
	header: "header",
	banner: "#banner"
}

export const FloatYourBoat = ({ kind }: FloatYourBoatProps) => {
	const [headerRect, setHeaderRect] = useState<DOMRect | null>()

	const loopDuration = headerRect ? headerRect.width / BOB_WIDTH_PX : 0

	const bobFrames = useMemo(() => {
		if (!loopDuration) return []

		const frames: number[] = []
		for (let i = 0; i < loopDuration; i++)
			frames.push(i % 2 ? BOB_HEIGHT_PX : 0)
		return frames
	}, [headerRect])

	useLayoutEffect(() => {
		setHeaderRect(
			document.querySelector(selectorsByKind[kind])?.getBoundingClientRect()
		)
	}, [])

	if (!headerRect) return null

	return (
		<Boat
			headerRect={headerRect}
			loopDuration={loopDuration}
			bobFrames={bobFrames}
		/>
	)
}

type BoatProps = {
	headerRect: DOMRect
	loopDuration: number
	bobFrames: number[]
}

const Boat = ({ headerRect, loopDuration, bobFrames }: BoatProps) => {
	const opacityFrames = bobFrames.map((_, i) =>
		i === 0 || i === bobFrames.length - 1 ? 0
		: i === 1 || i === bobFrames.length - 2 ? 0.5
		: 1
	)
	return (
		<motion.div
			className="pointer-events-none"
			initial={{
				position: "absolute",
				top: headerRect.height - 88,
				x: -40,
				zIndex: -10,
				opacity: 0
			}}
			animate={{
				x: headerRect.width - 100,
				y: bobFrames,
				opacity: opacityFrames
			}}
			transition={{
				duration: loopDuration,
				repeat: Infinity,
				ease: "linear",
				delay: 1
			}}
		>
			<BoatIcon height={100} />
		</motion.div>
	)
}
