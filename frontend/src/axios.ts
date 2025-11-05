import axios from "axios";

const SERVER_URL =
	import.meta.env.API_URL || "https://git-odyssey.onrender.com";

export const api = axios.create({
	baseURL: SERVER_URL,
	withCredentials: true,
});
