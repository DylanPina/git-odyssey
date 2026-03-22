import { useState } from "react";
import { Loader2, Search as SearchIcon, Send } from "lucide-react";
import { toast } from "react-toastify";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { filterCommits } from "@/api/api";
import { EMPTY_FILTERS, type FilterFormData } from "@/lib/filter-utils";

interface SearchProps {
  repoPath?: string;
  filters?: FilterFormData;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSearchResults?: (commitShas: string[], query?: string) => void;
  inputId?: string;
}

export default function Search({
  repoPath = "",
  filters = EMPTY_FILTERS,
  query = "",
  onQueryChange,
  onSearchResults,
  inputId,
}: SearchProps) {
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    const trimmedQuery = query.trim();

    if (!trimmedQuery) {
      toast.warning("Enter a query to search commits.", { theme: "dark" });
      return;
    }

    if (!repoPath) {
      toast.warning("Choose a Git project first.", { theme: "dark" });
      return;
    }

    setIsLoading(true);
    try {
      const response = await filterCommits(trimmedQuery, filters, repoPath);

      onSearchResults?.(response.commit_shas, trimmedQuery);
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to perform search. Please try again.", {
        theme: "dark",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isLoading) {
      handleSearch();
    }
  };

  return (
    <div className="workspace-dock w-full p-1">
      <InputGroup className="h-10 border-0 bg-transparent px-1 hover:bg-transparent has-[[data-slot=input-group-control]:focus-visible]:border-transparent has-[[data-slot=input-group-control]:focus-visible]:ring-0">
        <InputGroupAddon
          align="inline-start"
          className="pl-3 pr-1 text-text-secondary"
        >
          <SearchIcon className="size-4" />
        </InputGroupAddon>
        <InputGroupInput
          id={inputId}
          placeholder="Search commits, files, paths, or summaries"
          aria-keyshortcuts="Meta+K Control+K"
          className="px-1.5 text-sm placeholder:text-text-tertiary"
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          onKeyDown={handleKeyDown}
          disabled={isLoading}
        />
        <InputGroupAddon align="inline-end" className="pl-1 pr-1">
          <Button
            variant="accent"
            size="icon-sm"
            className="rounded-full"
            onClick={handleSearch}
            disabled={isLoading}
            aria-label="Run search"
          >
            {isLoading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
          </Button>
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}
