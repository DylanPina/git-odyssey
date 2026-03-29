import { useState } from "react";
import { Search as SearchIcon } from "lucide-react";
import { toast } from "react-toastify";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { filterCommits } from "@/api/api";
import type { FilterSearchResult } from "@/lib/definitions/api";
import { EMPTY_FILTERS, type FilterFormData } from "@/lib/filter-utils";

interface SearchProps {
  repoPath?: string | null;
  filters?: FilterFormData;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSearchResults?: (results: FilterSearchResult[], query?: string) => void;
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

      onSearchResults?.(response.results, trimmedQuery);
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
    <InputGroup className="min-h-11 rounded-[16px] border-border-strong bg-[rgba(11,13,16,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]">
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
        className="px-1.5 py-3 pr-3 text-sm placeholder:text-text-tertiary"
        value={query}
        onChange={(event) => onQueryChange?.(event.target.value)}
        onKeyDown={handleKeyDown}
        disabled={isLoading}
      />
    </InputGroup>
  );
}
