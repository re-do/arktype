"use client"

import { useEffect } from "react"

export type GlobalErrorProps = {
	error: Error & { digest?: string }
	reset: () => void
}

export default function GlobalError() {
	useEffect(() => {
		const THRESHOLD = 2 * 60 * 1000
		const now = Date.now()
		const lastReloadStr = localStorage.getItem("globalErrorLastReload")
		const lastReload = lastReloadStr ? parseInt(lastReloadStr, 10) : 0

		if (!lastReloadStr || now - lastReload > THRESHOLD) {
			localStorage.setItem("globalErrorLastReload", now.toString())
			window.location.reload()
		}
	})

	const containerStyle: React.CSSProperties = {
		minHeight: "100vh",
		margin: "0",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: "hsl(207 100% 9%)",
		fontFamily: "system-ui, sans-serif",
		color: "#E5E7EB"
	}

	const cardStyle: React.CSSProperties = {
		backgroundColor: "rgba(30, 41, 59, 0.5)",
		backdropFilter: "blur(10px)",
		padding: "2.5rem",
		borderRadius: "0.75rem",
		boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
		textAlign: "center",
		maxWidth: "400px",
		border: "1px solid rgba(255, 255, 255, 0.1)"
	}

	const headingStyle: React.CSSProperties = {
		fontSize: "2.25rem",
		fontWeight: 600,
		marginBottom: "1.5rem",
		background: "linear-gradient(135deg, #E5E7EB 0%, #94A3B8 100%)",
		WebkitBackgroundClip: "text",
		WebkitTextFillColor: "transparent",
		letterSpacing: "-0.025em"
	}

	const paraStyle: React.CSSProperties = {
		fontSize: "1.1rem",
		marginBottom: "2rem",
		color: "#94A3B8",
		lineHeight: 1.6
	}

	const buttonStyle: React.CSSProperties = {
		padding: "0.75rem 1.5rem",
		border: "1px solid rgba(255, 255, 255, 0.1)",
		borderRadius: "0.5rem",
		color: "#E5E7EB",
		cursor: "pointer",
		fontSize: "0.95rem",
		fontWeight: 500,
		transition: "all 0.2s ease",
		background: "rgba(255, 255, 255, 0.05)"
	}

	const buttonHoverStyle = {
		...buttonStyle,
		background: "rgba(255, 255, 255, 0.1)"
	}

	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<title>Shipwrecked!</title>
			</head>
			<body style={containerStyle}>
				<div style={cardStyle}>
					<h2 style={headingStyle}>Shipwrecked!</h2>
					<p style={paraStyle}>Something unexpected went wrong.</p>
					<div
						style={{
							display: "flex",
							gap: "1rem",
							justifyContent: "center"
						}}
					>
						<button
							onClick={() => window.location.reload()}
							style={buttonStyle}
							onMouseOver={e =>
								Object.assign(e.currentTarget.style, buttonHoverStyle)
							}
							onMouseOut={e =>
								Object.assign(e.currentTarget.style, buttonStyle)
							}
						>
							Reload
						</button>
						<button
							onClick={() => window.location.replace(window.location.origin)}
							style={buttonStyle}
							onMouseOver={e =>
								Object.assign(e.currentTarget.style, buttonHoverStyle)
							}
							onMouseOut={e =>
								Object.assign(e.currentTarget.style, buttonStyle)
							}
						>
							Go Home
						</button>
					</div>
				</div>
			</body>
		</html>
	)
}
