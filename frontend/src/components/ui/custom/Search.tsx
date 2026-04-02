import { useEffect, useState } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { toast } from "react-toastify";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

interface SearchProps {
  repoPath?: string | null;
  query?: string;
  onQueryChange?: (query: string) => void;
  onSearch?: (query: string) => void;
  isSearching?: boolean;
  inputId?: string;
}

export default function Search({
  repoPath = "",
  query = "",
  onQueryChange,
  onSearch,
  isSearching = false,
  inputId,
}: SearchProps) {
  const [isPressed, setIsPressed] = useState(false);

  useEffect(() => {
    if (!isSearching) {
      setIsPressed(false);
    }
  }, [isSearching]);

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

    setIsPressed(true);
    try {
      await Promise.resolve(onSearch?.(trimmedQuery));
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to perform search. Please try again.", {
        theme: "dark",
      });
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter" && !isSearching) {
      void handleSearch();
    }
  };

  return (
    <InputGroup
      className={`min-h-11 rounded-[16px] border-border-strong bg-[rgba(11,13,16,0.78)] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)] transition-[border-color,box-shadow] duration-200 ${
        isSearching || isPressed
          ? "border-[rgba(122,162,255,0.55)] shadow-[0_0_0_1px_rgba(122,162,255,0.22),0_0_28px_rgba(73,118,255,0.18),inset_0_1px_0_rgba(255,255,255,0.05)]"
          : ""
      }`}
    >
      <InputGroupAddon
        align="inline-start"
        className="pl-3 pr-1 text-text-secondary"
      >
        {isSearching ? (
          <Loader2
            aria-hidden="true"
            className="size-4 animate-spin text-[#9ebcff]"
          />
        ) : (
          <SearchIcon className="size-4" />
        )}
      </InputGroupAddon>
      <InputGroupInput
        id={inputId}
        placeholder="Search commits, files, paths, or diffs"
        aria-keyshortcuts="Meta+K Control+K"
        aria-busy={isSearching}
        className="px-1.5 py-3 pr-3 text-sm placeholder:text-text-tertiary"
        value={query}
        onChange={(event) => {
          setIsPressed(false);
          onQueryChange?.(event.target.value);
        }}
        onKeyDown={handleKeyDown}
        disabled={isSearching}
      />
    </InputGroup>
  );
}
