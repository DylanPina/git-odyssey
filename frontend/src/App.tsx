"use client";

import "./App.css";
import { Routes, Route, Navigate } from "react-router-dom";
import { Home } from "@/pages/Home";
import { Repo } from "@/pages/Repo";
import { Commit } from "@/pages/Commit";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

function App() {
	return (
		<div className="w-full h-full">
			<Routes>
				<Route path="/" element={<Home />} />
				<Route path="/index.html" element={<Navigate to="/" replace />} />
				<Route path="/repo/:owner/:repo_name" element={<Repo />} />
				<Route
					path="/repo/:owner/:repo_name/commit/:commitSha"
					element={<Commit />}
				/>
			</Routes>
			<ToastContainer
				theme="dark"
				position="top-right"
				autoClose={3000}
				hideProgressBar={false}
				newestOnTop={false}
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
