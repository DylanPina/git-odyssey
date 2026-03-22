import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { MessageCircle, Search, Settings as SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import Chat from "@/components/ui/custom/Chat";
import SearchResults from "@/components/ui/custom/SearchResults";
import type { ChatMessage } from "@/lib/definitions/chat";
import type { Commit } from "@/lib/definitions/repo";
import { useSidebarTab, type SidebarTab } from "@/hooks/useSidebarTab";
import { buildSettingsRoute } from "@/lib/repoPaths";

type RepoSidebarTab = Extract<SidebarTab, "search" | "chat">;

const REPO_SIDEBAR_TABS = [
  { value: "search", label: "Search", icon: Search },
  { value: "chat", label: "Chat", icon: MessageCircle },
] satisfies ReadonlyArray<{
  value: RepoSidebarTab;
  label: string;
  icon: typeof Search;
}>;

const sidebarSettingsButtonClass =
  "border-transparent bg-transparent text-sidebar-foreground shadow-none hover:bg-transparent hover:text-sidebar-foreground active:bg-transparent active:text-sidebar-foreground data-[active=true]:border-transparent data-[active=true]:bg-transparent data-[active=true]:text-sidebar-foreground data-[active=true]:shadow-none data-[state=open]:hover:bg-transparent data-[state=open]:hover:text-sidebar-foreground";

interface RepoSidebarProps {
  repoPath?: string | null;
  filteredCommits?: Commit[];
  lastSearchQuery?: string;
  onCommitClick?: (commitSha: string) => void;
  chatMessages?: ChatMessage[];
  isChatLoading?: boolean;
  chatError?: string | null;
  onSendChatMessage?: (message: string) => void;
}

export function RepoSidebar({
  repoPath,
  filteredCommits = [],
  lastSearchQuery = "",
  onCommitClick,
  chatMessages = [],
  isChatLoading = false,
  chatError = null,
  onSendChatMessage,
}: RepoSidebarProps) {
  const navigate = useNavigate();
  const { selectedTab, setSelectedTab } = useSidebarTab();
  const { isMobile, setOpen, setOpenMobile, state } = useSidebar();
  const activeTab: RepoSidebarTab = selectedTab === "chat" ? "chat" : "search";
  const isCollapsed = !isMobile && state === "collapsed";

  const openTab = (tab: RepoSidebarTab) => {
    setSelectedTab(tab);

    if (isMobile) {
      setOpenMobile(true);
      return;
    }

    setOpen(true);
  };

  const handleTabChange = (value: string) => {
    if (value === "search" || value === "chat") {
      openTab(value);
    }
  };

  const handleOpenSettings = () => {
    navigate(buildSettingsRoute(repoPath));
  };

  return (
    <Sidebar variant="inset" collapsible="icon">
      {isCollapsed ? (
        <>
          <SidebarHeader className="items-center gap-2 px-2 py-4">
            <SidebarMenu className="items-center gap-2">
              {REPO_SIDEBAR_TABS.map(({ value, label, icon: Icon }) => (
                <SidebarMenuItem key={value}>
                  <SidebarMenuButton
                    type="button"
                    tooltip={label}
                    isActive={activeTab === value}
                    aria-label={label}
                    className="justify-center"
                    onClick={() => openTab(value)}
                  >
                    <Icon className="size-4" />
                    <span className="sr-only">{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarHeader>

          <SidebarFooter className="mt-auto items-center px-2 pb-4 pt-2">
            <SidebarMenu className="items-center">
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  tooltip="Settings"
                  aria-label="Settings"
                  className={`justify-center ${sidebarSettingsButtonClass} [&>svg]:size-5`}
                  onClick={handleOpenSettings}
                >
                  <SettingsIcon className="size-4" />
                  <span className="sr-only">Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      ) : (
        <>
          <SidebarHeader className="min-w-0">
            <SidebarMenu className="gap-0">
              <ToggleGroup
                className="w-full"
                type="single"
                value={activeTab}
                onValueChange={handleTabChange}
              >
                <ToggleGroupItem value="search" aria-label="Search" className="gap-2">
                  <Search className="size-4" />
                  <span>Search</span>
                </ToggleGroupItem>
                <ToggleGroupItem value="chat" aria-label="Chat" className="gap-2">
                  <MessageCircle className="size-4" />
                  <span>Chat</span>
                </ToggleGroupItem>
              </ToggleGroup>
            </SidebarMenu>
          </SidebarHeader>

          <SidebarSeparator />

          <SidebarContent className="min-h-0">
            {activeTab === "search" ? (
              <SearchResults
                filteredCommits={filteredCommits}
                query={lastSearchQuery}
                onCommitClick={onCommitClick ?? (() => {})}
              />
            ) : (
              <Chat
                messages={chatMessages}
                isLoading={isChatLoading}
                error={chatError}
                onSendMessage={onSendChatMessage}
                onCommitClick={onCommitClick}
              />
            )}
          </SidebarContent>

          <SidebarSeparator />

          <SidebarFooter className="p-4 pt-3">
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  type="button"
                  size="lg"
                  tooltip="Settings"
                  className={`${sidebarSettingsButtonClass} gap-3 px-1 text-[15px] font-medium [&>svg]:size-5`}
                  onClick={handleOpenSettings}
                >
                  <SettingsIcon className="size-4" />
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarFooter>
        </>
      )}

      <SidebarRail />
    </Sidebar>
  );
}
