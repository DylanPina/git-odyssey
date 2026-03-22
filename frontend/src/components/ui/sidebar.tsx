/* eslint-disable react-refresh/only-export-components */
"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { PanelLeftIcon } from "lucide-react";

import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";

const SIDEBAR_STORAGE_KEY = "git-odyssey.sidebar_state";
const SIDEBAR_WIDTH_STORAGE_KEY = "git-odyssey.sidebar_width";
const SIDEBAR_WIDTH_DEFAULT = 360;
const SIDEBAR_WIDTH_MIN = 300;
const SIDEBAR_WIDTH_MAX = 520;
const SIDEBAR_WIDTH_MOBILE = "22rem";
const SIDEBAR_WIDTH_ICON = "4.5rem";
const SIDEBAR_KEYBOARD_SHORTCUT = "b";

function clampSidebarWidth(width: number, minWidth: number, maxWidth: number) {
	return Math.min(maxWidth, Math.max(minWidth, width));
}

function getStoredSidebarState(defaultOpen: boolean) {
	if (typeof window === "undefined") {
		return defaultOpen;
	}

	try {
		const storedState = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
		if (storedState === null) {
			return defaultOpen;
		}

		return storedState === "true";
	} catch {
		return defaultOpen;
	}
}

function getStoredSidebarWidth(
	defaultWidth: number,
	minWidth: number,
	maxWidth: number
) {
	if (typeof window === "undefined") {
		return defaultWidth;
	}

	try {
		const storedWidth = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
		if (storedWidth === null) {
			return defaultWidth;
		}

		const parsedWidth = Number.parseFloat(storedWidth);
		if (Number.isNaN(parsedWidth)) {
			return defaultWidth;
		}

		return clampSidebarWidth(parsedWidth, minWidth, maxWidth);
	} catch {
		return defaultWidth;
	}
}

type SidebarContextProps = {
	state: "expanded" | "collapsed";
	open: boolean;
	setOpen: (open: boolean) => void;
	openMobile: boolean;
	setOpenMobile: (open: boolean) => void;
	isMobile: boolean;
	toggleSidebar: () => void;
	desktopWidth: number;
	setDesktopWidth: (width: number | ((width: number) => number)) => void;
	resetDesktopWidth: () => void;
	minDesktopWidth: number;
	maxDesktopWidth: number;
};

const SidebarContext = React.createContext<SidebarContextProps | null>(null);

function useSidebar() {
	const context = React.useContext(SidebarContext);
	if (!context) {
		throw new Error("useSidebar must be used within a SidebarProvider.");
	}

	return context;
}

function SidebarProvider({
	defaultOpen = true,
	defaultWidth = SIDEBAR_WIDTH_DEFAULT,
	minWidth = SIDEBAR_WIDTH_MIN,
	maxWidth = SIDEBAR_WIDTH_MAX,
	open: openProp,
	onOpenChange: setOpenProp,
	className,
	style,
	children,
	...props
}: React.ComponentProps<"div"> & {
	defaultOpen?: boolean;
	defaultWidth?: number;
	minWidth?: number;
	maxWidth?: number;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
}) {
	const isMobile = useIsMobile();
	const [openMobile, setOpenMobile] = React.useState(false);
	const [desktopWidth, setDesktopWidthState] = React.useState(() =>
		getStoredSidebarWidth(defaultWidth, minWidth, maxWidth)
	);

	// This is the internal state of the sidebar.
	// We use openProp and setOpenProp for control from outside the component.
	const [_open, _setOpen] = React.useState(() =>
		getStoredSidebarState(defaultOpen)
	);
	const open = openProp ?? _open;
	const setOpen = React.useCallback(
		(value: boolean | ((value: boolean) => boolean)) => {
			const openState = typeof value === "function" ? value(open) : value;
			if (setOpenProp) {
				setOpenProp(openState);
			} else {
				_setOpen(openState);
			}

			try {
				window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(openState));
			} catch {
				// Ignore local storage failures and keep the in-memory state.
			}
		},
		[setOpenProp, open]
	);

	const setDesktopWidth = React.useCallback(
		(value: number | ((width: number) => number)) => {
			const nextWidth = clampSidebarWidth(
				typeof value === "function" ? value(desktopWidth) : value,
				minWidth,
				maxWidth
			);
			setDesktopWidthState(nextWidth);

			try {
				window.localStorage.setItem(
					SIDEBAR_WIDTH_STORAGE_KEY,
					String(nextWidth)
				);
			} catch {
				// Ignore local storage failures and keep the in-memory state.
			}
		},
		[desktopWidth, maxWidth, minWidth]
	);

	const resetDesktopWidth = React.useCallback(() => {
		setDesktopWidth(defaultWidth);
	}, [defaultWidth, setDesktopWidth]);

	// Helper to toggle the sidebar.
	const toggleSidebar = React.useCallback(() => {
		return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open);
	}, [isMobile, setOpen, setOpenMobile]);

	// Adds a keyboard shortcut to toggle the sidebar.
	React.useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (
				event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
				(event.metaKey || event.ctrlKey)
			) {
				event.preventDefault();
				toggleSidebar();
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [toggleSidebar]);

	// We add a state so that we can do data-state="expanded" or "collapsed".
	// This makes it easier to style the sidebar with Tailwind classes.
	const state = open ? "expanded" : "collapsed";

	const contextValue = React.useMemo<SidebarContextProps>(
		() => ({
			state,
			open,
			setOpen,
			isMobile,
			openMobile,
			setOpenMobile,
			toggleSidebar,
			desktopWidth,
			setDesktopWidth,
			resetDesktopWidth,
			minDesktopWidth: minWidth,
			maxDesktopWidth: maxWidth,
		}),
		[
			state,
			open,
			setOpen,
			isMobile,
			openMobile,
			setOpenMobile,
			toggleSidebar,
			desktopWidth,
			setDesktopWidth,
			resetDesktopWidth,
			minWidth,
			maxWidth,
		]
	);

	return (
		<SidebarContext.Provider value={contextValue}>
			<TooltipProvider delayDuration={0}>
				<div
					data-slot="sidebar-wrapper"
					style={
						{
							"--sidebar-width": `${desktopWidth}px`,
							"--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
							...style,
						} as React.CSSProperties
					}
						className={cn(
							"group/sidebar-wrapper flex h-svh min-h-svh w-full overflow-hidden bg-canvas",
							className
						)}
					{...props}
				>
					{children}
				</div>
			</TooltipProvider>
		</SidebarContext.Provider>
	);
}

function Sidebar({
	side = "left",
	variant = "sidebar",
	collapsible = "offcanvas",
	className,
	children,
	...props
}: React.ComponentProps<"div"> & {
	side?: "left" | "right";
	variant?: "sidebar" | "floating" | "inset";
	collapsible?: "offcanvas" | "icon" | "none";
}) {
	const { isMobile, state, openMobile, setOpenMobile } = useSidebar();

	if (collapsible === "none") {
		return (
			<div
				data-slot="sidebar"
				className={cn(
					"bg-sidebar text-sidebar-foreground flex h-full w-(--sidebar-width) flex-col border-r border-sidebar-border",
					className
				)}
				{...props}
			>
				{children}
			</div>
		);
	}

	if (isMobile) {
		return (
			<Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
				<SheetContent
					data-sidebar="sidebar"
					data-slot="sidebar"
					data-mobile="true"
					className="bg-sidebar text-sidebar-foreground w-[min(var(--sidebar-width),100vw)] border-r border-sidebar-border p-0 [&>button]:hidden"
					style={
						{
							"--sidebar-width": SIDEBAR_WIDTH_MOBILE,
						} as React.CSSProperties
					}
					side={side}
				>
					<SheetHeader className="sr-only">
						<SheetTitle>Sidebar</SheetTitle>
						<SheetDescription>Displays the mobile sidebar.</SheetDescription>
					</SheetHeader>
					<div className="flex h-full w-full flex-col">{children}</div>
				</SheetContent>
			</Sheet>
		);
	}

	return (
		<div
			className="group peer hidden text-sidebar-foreground lg:block"
			data-state={state}
			data-collapsible={state === "collapsed" ? collapsible : ""}
			data-variant={variant}
			data-side={side}
			data-slot="sidebar"
		>
			{/* This is what handles the sidebar gap on desktop */}
			<div
				data-slot="sidebar-gap"
				className={cn(
					"relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",
					"group-data-[collapsible=offcanvas]:w-0",
					"group-data-[side=right]:rotate-180",
					variant === "floating" || variant === "inset"
						? "group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
						: "group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
				)}
			/>
			<div
				data-slot="sidebar-container"
				className={cn(
					"fixed inset-y-0 z-20 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear lg:flex",
					side === "left"
						? "left-0 group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)]"
						: "right-0 group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)]",
					// Adjust the padding for floating and inset variants.
					variant === "floating" || variant === "inset"
						? "p-4 group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(8))+2px)]"
						: "group-data-[collapsible=icon]:w-(--sidebar-width-icon) group-data-[side=left]:border-r group-data-[side=right]:border-l",
					className
				)}
				{...props}
			>
				<div
					data-sidebar="sidebar"
					data-slot="sidebar-inner"
					className="flex h-full w-full flex-col overflow-hidden border border-sidebar-border bg-sidebar group-data-[variant=floating]:rounded-[var(--radius-panel)] group-data-[variant=floating]:shadow-[var(--shadow-panel)] group-data-[variant=inset]:rounded-[var(--radius-panel)] group-data-[variant=sidebar]:border-r-0"
				>
					{children}
				</div>
			</div>
		</div>
	);
}

function SidebarTrigger({
	className,
	onClick,
	...props
}: React.ComponentProps<typeof Button>) {
	const { toggleSidebar } = useSidebar();

	return (
		<Button
			data-sidebar="trigger"
			data-slot="sidebar-trigger"
			variant="toolbar"
			size="toolbar-icon"
			aria-keyshortcuts="Meta+B Control+B"
			className={cn(className)}
			onClick={(event) => {
				onClick?.(event);
				toggleSidebar();
			}}
			{...props}
		>
			<PanelLeftIcon />
			<span className="sr-only">Toggle Sidebar</span>
		</Button>
	);
}

function SidebarRail({ className, ...props }: React.ComponentProps<"button">) {
	const {
		isMobile,
		state,
		desktopWidth,
		setDesktopWidth,
		resetDesktopWidth,
		minDesktopWidth,
		maxDesktopWidth,
	} = useSidebar();
	const dragStateRef = React.useRef<{
		startX: number;
		startWidth: number;
		side: "left" | "right";
	} | null>(null);

	return (
		<button
			data-sidebar="rail"
			data-slot="sidebar-rail"
			aria-label="Resize sidebar"
			aria-orientation="vertical"
			aria-valuemin={minDesktopWidth}
			aria-valuemax={maxDesktopWidth}
			aria-valuenow={desktopWidth}
			role="separator"
			title="Drag to resize sidebar. Double-click to reset."
			onPointerDown={(event) => {
				if (isMobile || state === "collapsed") {
					return;
				}

				event.preventDefault();
				const side =
					event.currentTarget
						.closest<HTMLElement>("[data-slot='sidebar']")
						?.dataset.side === "right"
						? "right"
						: "left";
				const ownerWindow =
					event.currentTarget.ownerDocument.defaultView ?? window;
				const ownerDocument = event.currentTarget.ownerDocument;

				dragStateRef.current = {
					startX: event.clientX,
					startWidth: desktopWidth,
					side,
				};
				ownerDocument.body.style.cursor = "col-resize";
				ownerDocument.body.style.userSelect = "none";

				const handlePointerMove = (moveEvent: PointerEvent) => {
					const currentDrag = dragStateRef.current;
					if (!currentDrag) {
						return;
					}

					const delta = moveEvent.clientX - currentDrag.startX;
					const nextWidth =
						currentDrag.side === "right"
							? currentDrag.startWidth - delta
							: currentDrag.startWidth + delta;
					setDesktopWidth(nextWidth);
				};

				const handlePointerUp = () => {
					dragStateRef.current = null;
					ownerDocument.body.style.cursor = "";
					ownerDocument.body.style.userSelect = "";
					ownerWindow.removeEventListener("pointermove", handlePointerMove);
					ownerWindow.removeEventListener("pointerup", handlePointerUp);
				};

				ownerWindow.addEventListener("pointermove", handlePointerMove);
				ownerWindow.addEventListener("pointerup", handlePointerUp);
			}}
			onDoubleClick={() => {
				if (state === "expanded") {
					resetDesktopWidth();
				}
			}}
			onKeyDown={(event) => {
				if (state === "collapsed") {
					return;
				}

				if (event.key === "ArrowLeft") {
					event.preventDefault();
					setDesktopWidth((currentWidth) => currentWidth - 16);
				}
				if (event.key === "ArrowRight") {
					event.preventDefault();
					setDesktopWidth((currentWidth) => currentWidth + 16);
				}
				if (event.key === "Home") {
					event.preventDefault();
					setDesktopWidth(minDesktopWidth);
				}
				if (event.key === "End") {
					event.preventDefault();
					setDesktopWidth(maxDesktopWidth);
				}
			}}
			className={cn(
				"absolute inset-y-0 z-30 hidden w-5 -translate-x-1/2 items-stretch justify-center outline-none transition-all ease-linear after:absolute after:inset-y-4 after:left-1/2 after:w-px after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors lg:flex",
				"group-data-[side=left]:-right-5 group-data-[side=right]:left-1",
				"cursor-col-resize hover:after:bg-transparent focus-visible:after:bg-transparent",
				"group-data-[state=collapsed]:hidden group-data-[collapsible=offcanvas]:hidden",
				className
			)}
			{...props}
		/>
	);
}

function SidebarInset({ className, ...props }: React.ComponentProps<"main">) {
	return (
		<main
			data-slot="sidebar-inset"
			className={cn(
				"bg-background relative flex min-h-0 w-full flex-1 flex-col",
				"lg:peer-data-[variant=inset]:m-4 lg:peer-data-[variant=inset]:ml-0 lg:peer-data-[variant=inset]:rounded-[var(--radius-panel)] lg:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-4",
				className
			)}
			{...props}
		/>
	);
}

function SidebarInput({
	className,
	...props
}: React.ComponentProps<typeof Input>) {
	return (
		<Input
			data-slot="sidebar-input"
			data-sidebar="input"
			className={cn("h-10 w-full shadow-none", className)}
			{...props}
		/>
	);
}

function SidebarHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-header"
			data-sidebar="header"
			className={cn("flex min-w-0 flex-col gap-3 p-4", className)}
			{...props}
		/>
	);
}

function SidebarFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-footer"
			data-sidebar="footer"
			className={cn("flex min-w-0 flex-col gap-3 p-4 pt-0", className)}
			{...props}
		/>
	);
}

function SidebarSeparator({
	className,
	...props
}: React.ComponentProps<typeof Separator>) {
	return (
		<Separator
			data-slot="sidebar-separator"
			data-sidebar="separator"
			className={cn("mx-4 w-auto self-stretch bg-sidebar-border", className)}
			{...props}
		/>
	);
}

function SidebarContent({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-content"
			data-sidebar="content"
			className={cn(
				"flex min-h-0 min-w-0 flex-1 flex-col gap-4 overflow-hidden group-data-[collapsible=icon]:overflow-hidden",
				className
			)}
			{...props}
		/>
	);
}

function SidebarGroup({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-group"
			data-sidebar="group"
			className={cn(
				"relative flex w-full min-w-0 flex-col overflow-x-hidden px-4 pb-4",
				className
			)}
			{...props}
		/>
	);
}

function SidebarGroupLabel({
	className,
	asChild = false,
	...props
}: React.ComponentProps<"div"> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "div";

	return (
		<Comp
			data-slot="sidebar-group-label"
			data-sidebar="group-label"
			className={cn(
				"ring-sidebar-ring flex h-7 shrink-0 items-center rounded-md px-0 text-[11px] font-semibold uppercase tracking-[0.16em] text-sidebar-foreground/45 outline-hidden transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
				"group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",
				className
			)}
			{...props}
		/>
	);
}

function SidebarGroupAction({
	className,
	asChild = false,
	...props
}: React.ComponentProps<"button"> & { asChild?: boolean }) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="sidebar-group-action"
			data-sidebar="group-action"
			className={cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground absolute top-1 right-0 flex aspect-square w-8 items-center justify-center rounded-[10px] p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
				// Increases the hit area of the button on mobile.
				"after:absolute after:-inset-2 lg:after:hidden",
				"group-data-[collapsible=icon]:hidden",
				className
			)}
			{...props}
		/>
	);
}

function SidebarGroupContent({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-group-content"
			data-sidebar="group-content"
			className={cn("w-full min-w-0 text-sm", className)}
			{...props}
		/>
	);
}

function SidebarMenu({ className, ...props }: React.ComponentProps<"ul">) {
	return (
		<ul
			data-slot="sidebar-menu"
			data-sidebar="menu"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
			{...props}
		/>
	);
}

function SidebarMenuItem({ className, ...props }: React.ComponentProps<"li">) {
	return (
		<li
			data-slot="sidebar-menu-item"
			data-sidebar="menu-item"
			className={cn("group/menu-item relative", className)}
			{...props}
		/>
	);
}

const sidebarMenuButtonVariants = cva(
	"peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-[calc(var(--radius-control)-1px)] border border-transparent px-3 text-left text-[13px] outline-hidden ring-sidebar-ring transition-[width,height,padding,background-color,border-color,color] duration-150 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 active:bg-sidebar-accent active:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 group-has-data-[sidebar=menu-action]/menu-item:pr-8 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-[active=true]:border-[rgba(122,162,255,0.28)] data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground data-[active=true]:shadow-[inset_0_0_0_1px_rgba(122,162,255,0.35)] data-[state=open]:hover:bg-sidebar-accent data-[state=open]:hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-10! group-data-[collapsible=icon]:p-0! [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
	{
		variants: {
			variant: {
				default: "bg-transparent text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
				outline:
					"border-sidebar-border bg-control text-sidebar-foreground hover:border-sidebar-border hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
			},
			size: {
				default: "h-9 text-[13px]",
				sm: "h-8 text-xs",
				lg: "h-11 text-[13px] group-data-[collapsible=icon]:p-0!",
			},
		},
		defaultVariants: {
			variant: "default",
			size: "default",
		},
	}
);

function SidebarMenuButton({
	asChild = false,
	isActive = false,
	variant = "default",
	size = "default",
	tooltip,
	className,
	...props
}: React.ComponentProps<"button"> & {
	asChild?: boolean;
	isActive?: boolean;
	tooltip?: string | React.ComponentProps<typeof TooltipContent>;
} & VariantProps<typeof sidebarMenuButtonVariants>) {
	const Comp = asChild ? Slot : "button";
	const { isMobile, state } = useSidebar();

	const button = (
		<Comp
			data-slot="sidebar-menu-button"
			data-sidebar="menu-button"
			data-size={size}
			data-active={isActive}
			className={cn(sidebarMenuButtonVariants({ variant, size }), className)}
			{...props}
		/>
	);

	if (!tooltip) {
		return button;
	}

	if (typeof tooltip === "string") {
		tooltip = {
			children: tooltip,
		};
	}

	return (
		<Tooltip>
			<TooltipTrigger asChild>{button}</TooltipTrigger>
			<TooltipContent
				side="right"
				align="center"
				hidden={state !== "collapsed" || isMobile}
				{...tooltip}
			/>
		</Tooltip>
	);
}

function SidebarMenuAction({
	className,
	asChild = false,
	showOnHover = false,
	...props
}: React.ComponentProps<"button"> & {
	asChild?: boolean;
	showOnHover?: boolean;
}) {
	const Comp = asChild ? Slot : "button";

	return (
		<Comp
			data-slot="sidebar-menu-action"
			data-sidebar="menu-action"
			className={cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground peer-hover/menu-button:text-sidebar-accent-foreground absolute top-1.5 right-1 flex aspect-square w-5 items-center justify-center rounded-md p-0 outline-hidden transition-transform focus-visible:ring-2 [&>svg]:size-4 [&>svg]:shrink-0",
				// Increases the hit area of the button on mobile.
				"after:absolute after:-inset-2 lg:after:hidden",
				"peer-data-[size=sm]/menu-button:top-1",
				"peer-data-[size=default]/menu-button:top-1.5",
				"peer-data-[size=lg]/menu-button:top-2.5",
				"group-data-[collapsible=icon]:hidden",
				showOnHover &&
					"peer-data-[active=true]/menu-button:text-sidebar-accent-foreground group-focus-within/menu-item:opacity-100 group-hover/menu-item:opacity-100 data-[state=open]:opacity-100 lg:opacity-0",
				className
			)}
			{...props}
		/>
	);
}

function SidebarMenuBadge({
	className,
	...props
}: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sidebar-menu-badge"
			data-sidebar="menu-badge"
			className={cn(
				"text-sidebar-foreground pointer-events-none absolute right-1 flex h-5 min-w-5 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums select-none",
				"peer-hover/menu-button:text-sidebar-accent-foreground peer-data-[active=true]/menu-button:text-sidebar-accent-foreground",
				"peer-data-[size=sm]/menu-button:top-1",
				"peer-data-[size=default]/menu-button:top-1.5",
				"peer-data-[size=lg]/menu-button:top-2.5",
				"group-data-[collapsible=icon]:hidden",
				className
			)}
			{...props}
		/>
	);
}

function SidebarMenuSkeleton({
	className,
	showIcon = false,
	...props
}: React.ComponentProps<"div"> & {
	showIcon?: boolean;
}) {
	// Random width between 50 to 90%.
	const width = React.useMemo(() => {
		return `${Math.floor(Math.random() * 40) + 50}%`;
	}, []);

	return (
		<div
			data-slot="sidebar-menu-skeleton"
			data-sidebar="menu-skeleton"
			className={cn("flex h-9 items-center gap-2 rounded-[calc(var(--radius-control)-2px)] px-3", className)}
			{...props}
		>
			{showIcon && (
				<Skeleton
					className="size-4 rounded-md"
					data-sidebar="menu-skeleton-icon"
				/>
			)}
			<Skeleton
				className="h-4 max-w-(--skeleton-width) flex-1"
				data-sidebar="menu-skeleton-text"
				style={
					{
						"--skeleton-width": width,
					} as React.CSSProperties
				}
			/>
		</div>
	);
}

function SidebarMenuSub({ className, ...props }: React.ComponentProps<"ul">) {
	return (
		<ul
			data-slot="sidebar-menu-sub"
			data-sidebar="menu-sub"
			className={cn(
				"border-sidebar-border mx-3.5 flex min-w-0 translate-x-px flex-col gap-1 border-l px-2.5 py-0.5",
				"text-sidebar-foreground/70",
				"group-data-[collapsible=icon]:hidden",
				className
			)}
			{...props}
		/>
	);
}

function SidebarMenuSubItem({
	className,
	...props
}: React.ComponentProps<"li">) {
	return (
		<li
			data-slot="sidebar-menu-sub-item"
			data-sidebar="menu-sub-item"
			className={cn("group/menu-sub-item relative", className)}
			{...props}
		/>
	);
}

function SidebarMenuSubButton({
	asChild = false,
	size = "md",
	isActive = false,
	className,
	...props
}: React.ComponentProps<"a"> & {
	asChild?: boolean;
	size?: "sm" | "md";
	isActive?: boolean;
}) {
	const Comp = asChild ? Slot : "a";

	return (
		<Comp
			data-slot="sidebar-menu-sub-button"
			data-sidebar="menu-sub-button"
			data-size={size}
			data-active={isActive}
			className={cn(
				"text-sidebar-foreground ring-sidebar-ring hover:bg-sidebar-accent hover:text-sidebar-accent-foreground active:bg-sidebar-accent active:text-sidebar-accent-foreground [&>svg]:text-sidebar-accent-foreground flex h-8 min-w-0 -translate-x-px items-center gap-2 overflow-hidden rounded-[calc(var(--radius-control)-2px)] px-2.5 outline-hidden focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 [&>span:last-child]:truncate [&>svg]:size-4 [&>svg]:shrink-0",
				"data-[active=true]:bg-sidebar-accent data-[active=true]:text-sidebar-accent-foreground",
				size === "sm" && "text-xs",
				size === "md" && "text-sm",
				"group-data-[collapsible=icon]:hidden",
				className
			)}
			{...props}
		/>
	);
}

export {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupAction,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarInput,
	SidebarInset,
	SidebarMenu,
	SidebarMenuAction,
	SidebarMenuBadge,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarMenuSkeleton,
	SidebarMenuSub,
	SidebarMenuSubButton,
	SidebarMenuSubItem,
	SidebarProvider,
	SidebarRail,
	SidebarSeparator,
	SidebarTrigger,
	useSidebar,
};
