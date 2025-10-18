import { useState } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Mic, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { filterCommits } from "@/api/api";
import { toast } from "react-toastify";

interface SearchProps {
  repoUrl?: string;
  onSearchResults?: (commitShas: string[], query?: string) => void;
}

export default function Search({ repoUrl = "", onSearchResults }: SearchProps) {
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = async () => {
    if (!query.trim()) {
      toast.warning("Please enter a search query", {
        theme: "dark",
      });
      return;
    }

    setIsLoading(true);
    try {
      const response = await filterCommits(
        query.trim(),
        {
          message: "",
          branch: "",
          commit: "",
          file: "",
          summary: "",
          startDate: "",
          endDate: "",
        },
        repoUrl,
      );

      const { commit_shas } = response;

      if (onSearchResults) {
        onSearchResults(commit_shas, query.trim());
      }

      if (commit_shas.length === 0) {
        toast.info("No commits found matching your search query", {
          theme: "dark",
        });
      } else {
        toast.success(`Found ${commit_shas.length} commit(s) matching your search`, {
          theme: "dark",
        });
      }
    } catch (error) {
      console.error("Search error:", error);
      toast.error("Failed to perform search. Please try again.", {
        theme: "dark",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isLoading) {
      handleSearch();
    }
  };

  return (
    <InputGroup className="pointer-events-auto w-full h-14 px-4 py-2 rounded-full bg-neutral-900/25 backdrop-blur-lg border-primary-white border-2">
      <InputGroupInput
        placeholder="Search using AI..."
        className="!text-md placeholder:text-white/40"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyPress={handleKeyPress}
        disabled={isLoading}
      />
      <InputGroupAddon align="inline-end">
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-white hover:text-white"
          disabled={isLoading}
        >
          <Mic />
        </Button>
      </InputGroupAddon>
      <InputGroupAddon align="inline-end">
        <Button
          variant="ghost"
          size="icon"
          className="hover:bg-white hover:text-white"
          onClick={handleSearch}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send />}
        </Button>
      </InputGroupAddon>
    </InputGroup>
  );
}
