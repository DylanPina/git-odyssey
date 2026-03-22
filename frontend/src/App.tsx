"use client";

import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Repo } from "@/pages/Repo";
import { Commit } from "@/pages/Commit";
import { Review } from "@/pages/Review";
import { Settings } from "@/pages/Settings";
import { useRepoNavigationShortcuts } from "@/hooks/useRepoNavigationShortcuts";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
	useRepoNavigationShortcuts();

	return (
		<div className="min-h-full w-full">
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/index.html" element={<Navigate to="/" replace />} />
				<Route path="/repo" element={<Repo />} />
				<Route path="/repo/commit/:commitSha" element={<Commit />} />
				<Route path="/repo/review" element={<Review />} />
				<Route path="/settings" element={<Settings />} />
			</Routes>
			<ToastContainer
				theme="dark"
				position="top-right"
				autoClose={3000}
				hideProgressBar
				newestOnTop
				closeOnClick
				rtl={false}
				pauseOnFocusLoss
				draggable
				pauseOnHover
			/>
		</div>
	);
}

export default App;
