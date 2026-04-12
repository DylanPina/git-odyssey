import fs = require("node:fs");
import path = require("node:path");

import type {
  DesktopAdditionalReviewGuideline,
  DesktopAdditionalReviewGuidelineSaveInput,
  DesktopAdditionalReviewGuidelineState,
} from "./types";
import { normalizePath } from "./git-projects";

const REVIEW_GUIDELINES_FILE_NAME = "review-guidelines.json";
const REVIEW_GUIDELINES_SCHEMA_VERSION = 1;

type PersistedAdditionalReviewGuidelineState =
  DesktopAdditionalReviewGuidelineState;

type PersistedReviewGuidelinesFile = {
  schemaVersion: number;
  entries: Record<string, PersistedAdditionalReviewGuidelineState>;
};

function normalizeDraftGuideline(value: unknown): string {
  return typeof value === "string" ? value.trimEnd() : "";
}

function normalizeSubmittedGuidelines(
  input: unknown
): DesktopAdditionalReviewGuideline[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input.flatMap((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const guideline = item as { id?: unknown; text?: unknown };
    const id =
      typeof guideline.id === "string" && guideline.id.trim()
        ? guideline.id.trim()
        : `guideline-${index + 1}`;
    const text =
      typeof guideline.text === "string" ? guideline.text.trim() : "";

    return text ? [{ id, text }] : [];
  });
}

function buildEmptyState(repoPath: string): DesktopAdditionalReviewGuidelineState {
  return {
    repoPath,
    draftGuideline: "",
    guidelines: [],
    updatedAt: null,
  };
}

class ReviewGuidelinesStore {
  rootPath: string;
  filePath: string;
  state: PersistedReviewGuidelinesFile;

  constructor({ rootPath }: { rootPath: string }) {
    this.rootPath = rootPath;
    this.filePath = path.join(rootPath, REVIEW_GUIDELINES_FILE_NAME);
    this.state = this.#load();
  }

  #ensureRootPath(): void {
    fs.mkdirSync(this.rootPath, { recursive: true });
  }

  #repoKey(repoPath: string): string {
    return encodeURIComponent(repoPath);
  }

  #normalizeRepoPath(repoPath: string): string {
    const normalizedRepoPath = normalizePath(repoPath);
    if (!normalizedRepoPath) {
      throw new Error(
        "A repository path is required to persist additional review guidelines."
      );
    }

    return normalizedRepoPath;
  }

  #defaultState(): PersistedReviewGuidelinesFile {
    return {
      schemaVersion: REVIEW_GUIDELINES_SCHEMA_VERSION,
      entries: {},
    };
  }

  #normalizeEntry(
    repoPath: string,
    rawEntry: unknown
  ): PersistedAdditionalReviewGuidelineState {
    const entry =
      rawEntry && typeof rawEntry === "object" && !Array.isArray(rawEntry)
        ? (rawEntry as {
            draftGuideline?: unknown;
            guidelines?: unknown;
            updatedAt?: unknown;
          })
        : {};
    const normalizedRepoPath = this.#normalizeRepoPath(repoPath);

    return {
      repoPath: normalizedRepoPath,
      draftGuideline: normalizeDraftGuideline(entry.draftGuideline),
      guidelines: normalizeSubmittedGuidelines(entry.guidelines),
      updatedAt:
        typeof entry.updatedAt === "string" && entry.updatedAt.trim()
          ? entry.updatedAt
          : null,
    };
  }

  #normalizeState(
    rawState: unknown
  ): PersistedReviewGuidelinesFile {
    const state =
      rawState && typeof rawState === "object" && !Array.isArray(rawState)
        ? (rawState as {
            schemaVersion?: unknown;
            entries?: unknown;
          })
        : {};
    const entries =
      state.entries && typeof state.entries === "object" && !Array.isArray(state.entries)
        ? (state.entries as Record<string, unknown>)
        : {};
    const normalizedEntries: Record<string, PersistedAdditionalReviewGuidelineState> = {};

    for (const rawEntry of Object.values(entries)) {
      if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
        continue;
      }

      const repoPath =
        typeof (rawEntry as { repoPath?: unknown }).repoPath === "string"
          ? (rawEntry as { repoPath: string }).repoPath
          : "";
      if (!repoPath) {
        continue;
      }

      const normalizedEntry = this.#normalizeEntry(repoPath, rawEntry);
      if (
        !normalizedEntry.draftGuideline &&
        normalizedEntry.guidelines.length === 0
      ) {
        continue;
      }

      normalizedEntries[this.#repoKey(normalizedEntry.repoPath)] = normalizedEntry;
    }

    return {
      schemaVersion:
        Number(state.schemaVersion) || REVIEW_GUIDELINES_SCHEMA_VERSION,
      entries: normalizedEntries,
    };
  }

  #saveFile(): void {
    this.#ensureRootPath();
    fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2));
  }

  #load(): PersistedReviewGuidelinesFile {
    this.#ensureRootPath();
    const defaults = this.#defaultState();

    if (!fs.existsSync(this.filePath)) {
      return defaults;
    }

    try {
      const raw = fs.readFileSync(this.filePath, "utf8");
      const parsed = JSON.parse(raw);
      const normalized = this.#normalizeState(parsed);
      this.state = normalized;
      this.#saveFile();
      return normalized;
    } catch {
      this.state = defaults;
      this.#saveFile();
      return defaults;
    }
  }

  get(repoPath: string): DesktopAdditionalReviewGuidelineState {
    const normalizedRepoPath = this.#normalizeRepoPath(repoPath);
    const entry = this.state.entries[this.#repoKey(normalizedRepoPath)];
    if (!entry) {
      return buildEmptyState(normalizedRepoPath);
    }

    return {
      repoPath: entry.repoPath,
      draftGuideline: entry.draftGuideline,
      guidelines: entry.guidelines,
      updatedAt: entry.updatedAt,
    };
  }

  save(
    input: DesktopAdditionalReviewGuidelineSaveInput
  ): DesktopAdditionalReviewGuidelineState {
    const normalizedRepoPath = this.#normalizeRepoPath(input.repoPath);
    const nextState: DesktopAdditionalReviewGuidelineState = {
      repoPath: normalizedRepoPath,
      draftGuideline: normalizeDraftGuideline(input.draftGuideline),
      guidelines: normalizeSubmittedGuidelines(input.guidelines),
      updatedAt: new Date().toISOString(),
    };

    if (!nextState.draftGuideline && nextState.guidelines.length === 0) {
      delete this.state.entries[this.#repoKey(normalizedRepoPath)];
      this.#saveFile();
      return buildEmptyState(normalizedRepoPath);
    }

    this.state.entries[this.#repoKey(normalizedRepoPath)] = nextState;
    this.#saveFile();
    return nextState;
  }
}

export {
  REVIEW_GUIDELINES_FILE_NAME,
  ReviewGuidelinesStore,
};
