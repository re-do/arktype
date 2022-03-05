import React from "react"
import { useTheme } from "@mui/material"

export const Logo = () => {
    const {
        palette: { primary, secondary }
    } = useTheme()
    return (
        <svg
            version="1.1"
            viewBox="0 0 1823 576"
            xmlns="http://www.w3.org/2000/svg"
        >
            <g
                id="background"
                fill="none"
                stroke-linecap="round"
                stroke-width="72"
            >
                <path
                    id="rMain"
                    d="m54.26 516.9v-259.9c10.07-85.6 64.81-169.7 148.8-197.8 74.87-26.98 162.5 0.3147 213.4 60.18 9.632 10.87 18.22 22.65 25.68 35.11"
                    stroke="#162b79"
                />
                <path
                    id="rArrow"
                    d="m353.4 154.4h88.82v-88.82"
                    stroke="#ffc40c"
                    stroke-linejoin="round"
                />
                <path
                    id="eMain"
                    d="m840.9 482.5a213.1 238.5 0 0 1-252.7-6.964 213.1 238.5 0 0 1-69.05-272.1 213.1 238.5 0 0 1 211.7-154.5 213.1 238.5 0 0 1 194.7 180.4"
                    stroke="#162b79"
                    stroke-linejoin="round"
                />
                <path id="eLine" d="m600 225h235" stroke="#ffc40c" />

                <circle
                    id="colonTop"
                    cx="1031"
                    cy="225"
                    r="36"
                    fill="#c80815"
                />
                <circle
                    id="colonBottom"
                    cx="1033"
                    cy="392.1"
                    r="36"
                    fill="#c80815"
                />
                <path
                    id="dMain"
                    d="m1042 524.5c115.5-6.018 205.7-113.8 203.2-243-2.486-129.2-96.73-232.5-212.4-233"
                    stroke="#162b79"
                />
                <path
                    id="oMain"
                    d="m1559 48.53a192 192 0 0 0-56.07 8.531c-82.15 25.3-145.2 104.4-155.2 203.2-12.18 120.3 58.18 231.8 163.6 259.2 105.4 27.39 212.5-37.99 248.9-152 36.45-114-9.264-240.5-106.3-294.2"
                    stroke="#162b79"
                />
                <path
                    id="oArrow"
                    d="m1743 73.4h-88.82v88.82"
                    stroke="#ffc40c"
                    stroke-linejoin="round"
                />
            </g>
        </svg>
    )
}
