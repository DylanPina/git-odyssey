import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean })
	.IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
	cleanup();
});

if (!HTMLElement.prototype.scrollIntoView) {
	Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
		value: vi.fn(),
		writable: true,
	});
}

if (
	typeof window !== "undefined" &&
	(typeof window.localStorage?.getItem !== "function" ||
		typeof window.localStorage?.setItem !== "function" ||
		typeof window.localStorage?.removeItem !== "function" ||
		typeof window.localStorage?.clear !== "function")
) {
	const storageState = new Map<string, string>();
	const storageShim: Storage = {
		get length() {
			return storageState.size;
		},
		clear() {
			storageState.clear();
		},
		getItem(key) {
			return storageState.get(key) ?? null;
		},
		key(index) {
			return Array.from(storageState.keys())[index] ?? null;
		},
		removeItem(key) {
			storageState.delete(key);
		},
		setItem(key, value) {
			storageState.set(String(key), String(value));
		},
	};

	Object.defineProperty(window, "localStorage", {
		value: storageShim,
		configurable: true,
	});
	Object.defineProperty(globalThis, "localStorage", {
		value: storageShim,
		configurable: true,
	});
}
