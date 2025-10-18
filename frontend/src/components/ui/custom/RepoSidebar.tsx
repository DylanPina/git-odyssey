import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarHeader,
	SidebarMenu,
} from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import Filters from "@/components/ui/custom/Filters";
import Chat from "@/components/ui/custom/Chat";
import type { Commit, Branch } from "@/lib/definitions/repo";
import type { ChatMessage } from "@/lib/definitions/chat";
import SearchResults from "@/components/ui/custom/SearchResults";
import type { FilterFormData } from "@/lib/filter-utils";
import { Search, MessageCircle } from "lucide-react";
import { useSidebarTab, type SidebarTab } from "@/hooks/useSidebarTab";

interface RepoSidebarProps {
	filteredCommits?: Commit[];
	filteredBranches?: Branch[];
	lastSearchQuery?: string;
	onCommitClick?: (commitSha: string) => void;
	onFiltersChange?: (filters: FilterFormData) => void;
	chatMessages?: ChatMessage[];
	isChatLoading?: boolean;
	chatError?: string | null;
	onSendChatMessage?: (message: string) => void;
}

export function RepoSidebar({
	filteredCommits = [],
	filteredBranches = [],
	lastSearchQuery = "",
	onCommitClick,
	onFiltersChange,
	chatMessages = [],
	isChatLoading = false,
	chatError = null,
	onSendChatMessage,
}: RepoSidebarProps) {
	const { selectedTab, setSelectedTab } = useSidebarTab();

	const handleTabChange = (value: string) => {
		if (
			value &&
			(value === "search" || value === "chat" || value === "summary")
		) {
			setSelectedTab(value as SidebarTab);
		}
	};

	return (
		<Sidebar>
			<SidebarHeader>
				<SidebarMenu className="flex items-center justify-center">
					<ToggleGroup
						className="flex items-center justify-between gap-2 w-full"
						type="single"
						value={selectedTab}
						onValueChange={handleTabChange}
					>
						<ToggleGroupItem
							value="search"
							aria-label="Search"
							className="flex-1 text-white/50 data-[state=on]:text-white data-[state=on]:border-white transition-colors"
						>
							<div className="flex items-center gap-2">
								<Search className="w-4 h-4" />
								<h3 className="text-sm font-bold">Search</h3>
							</div>
						</ToggleGroupItem>
						<ToggleGroupItem
							value="chat"
							aria-label="Chat"
							className="flex-1 text-white/50 data-[state=on]:text-white data-[state=on]:border-white transition-colors"
						>
							<div className="flex items-center gap-2">
								<MessageCircle className="w-4 h-4" />
								<h3 className="text-sm font-bold">Chat</h3>
							</div>
						</ToggleGroupItem>
					</ToggleGroup>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent className={selectedTab === "chat" ? "flex-1" : ""}>
				{selectedTab === "search" && (
					<SearchResults
						filteredCommits={filteredCommits}
						query={lastSearchQuery}
						onCommitClick={onCommitClick ?? (() => {})}
					/>
				)}
				{selectedTab === "chat" && (
					<Chat
						messages={chatMessages}
						isLoading={isChatLoading}
						error={chatError}
						onSendMessage={onSendChatMessage}
						onCommitClick={onCommitClick}
					/>
				)}
			</SidebarContent>
			{selectedTab !== "chat" && (
				<SidebarFooter>
					<Filters
						onFiltersChange={onFiltersChange}
						branches={filteredBranches?.map((branch) => branch.name) ?? []}
					/>
				</SidebarFooter>
			)}
		</Sidebar>
	);
}
