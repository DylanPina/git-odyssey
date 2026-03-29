import { useCallback } from "react";
import { toast } from "react-toastify";

type ClipboardCopyOptions = {
	successMessage?: string;
	errorMessage?: string;
};

export function useClipboardToast() {
	return useCallback(
		async (
			text: string,
			label: string,
			options: ClipboardCopyOptions = {},
		) => {
			const successMessage =
				options.successMessage ?? `${label} copied to clipboard`;
			const errorMessage =
				options.errorMessage ?? `Failed to copy ${label.toLowerCase()}`;

			try {
				if (
					typeof navigator === "undefined" ||
					typeof navigator.clipboard?.writeText !== "function"
				) {
					throw new Error("Clipboard access is unavailable.");
				}

				await navigator.clipboard.writeText(text);
				toast.success(successMessage, {
					position: "top-right",
					autoClose: 1800,
					theme: "dark",
				});
			} catch (error) {
				console.error("Failed to copy text:", error);
				toast.error(errorMessage, {
					position: "top-right",
					autoClose: 2600,
					theme: "dark",
				});
			}
		},
		[],
	);
}

export default useClipboardToast;
