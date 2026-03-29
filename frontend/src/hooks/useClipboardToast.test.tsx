import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useClipboardToast } from "@/hooks/useClipboardToast";

const toastMocks = vi.hoisted(() => ({
	success: vi.fn(),
	error: vi.fn(),
}));

vi.mock("react-toastify", () => ({
	toast: {
		success: toastMocks.success,
		error: toastMocks.error,
	},
}));

describe("useClipboardToast", () => {
	beforeEach(() => {
		toastMocks.success.mockReset();
		toastMocks.error.mockReset();
		vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("copies text and shows a success toast", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(window.navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		const { result } = renderHook(() => useClipboardToast());

		await act(async () => {
			await result.current("abc123", "SHA");
		});

		expect(writeText).toHaveBeenCalledWith("abc123");
		expect(toastMocks.success).toHaveBeenCalledWith("SHA copied to clipboard", {
			position: "top-right",
			autoClose: 1800,
			theme: "dark",
		});
		expect(toastMocks.error).not.toHaveBeenCalled();
	});

	it("shows an error toast when clipboard access fails", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		Object.defineProperty(window.navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});

		const { result } = renderHook(() => useClipboardToast());

		await act(async () => {
			await result.current("abc123", "SHA");
		});

		expect(toastMocks.error).toHaveBeenCalledWith("Failed to copy sha", {
			position: "top-right",
			autoClose: 2600,
			theme: "dark",
		});
	});
});
