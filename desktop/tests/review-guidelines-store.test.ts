const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  REVIEW_GUIDELINES_FILE_NAME,
  ReviewGuidelinesStore,
} = require("../src/review-guidelines-store");
const { normalizePath } = require("../src/git-projects");

function createRootPath() {
  return fs.mkdtempSync(
      path.join(os.tmpdir(), "git-odyssey-review-guidelines-store-")
  );
}

function cleanupRootPath(rootPath) {
  fs.rmSync(rootPath, { recursive: true, force: true });
}

test("persists review guidelines across store reloads", () => {
  const rootPath = createRootPath();

  try {
    const repoPath = path.join(rootPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });
    const normalizedRepoPath = normalizePath(repoPath);

    const store = new ReviewGuidelinesStore({ rootPath });
    const saved = store.save({
      repoPath,
      draftGuideline: "Draft guideline  ",
      guidelines: [
        {
          id: "guideline-1",
          text: "  Persisted guideline  ",
        },
      ],
    });

    assert.equal(
      fs.existsSync(path.join(rootPath, REVIEW_GUIDELINES_FILE_NAME)),
      true
    );
    assert.equal(saved.repoPath, normalizedRepoPath);
    assert.equal(saved.draftGuideline, "Draft guideline");
    assert.deepEqual(saved.guidelines, [
      {
        id: "guideline-1",
        text: "Persisted guideline",
      },
    ]);
    assert.ok(saved.updatedAt);

    const reloadedStore = new ReviewGuidelinesStore({ rootPath });
    assert.deepEqual(reloadedStore.get(repoPath), saved);
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("isolates review guidelines by repository", () => {
  const rootPath = createRootPath();

  try {
    const repoPathOne = path.join(rootPath, "repo-one");
    const repoPathTwo = path.join(rootPath, "repo-two");
    fs.mkdirSync(repoPathOne, { recursive: true });
    fs.mkdirSync(repoPathTwo, { recursive: true });
    const normalizedRepoPathOne = normalizePath(repoPathOne);
    const normalizedRepoPathTwo = normalizePath(repoPathTwo);

    const store = new ReviewGuidelinesStore({ rootPath });
    store.save({
      repoPath: repoPathOne,
      draftGuideline: "",
      guidelines: [
        {
          id: "guideline-1",
          text: "Repo one guideline",
        },
      ],
    });
    store.save({
      repoPath: repoPathTwo,
      draftGuideline: "Repo two draft",
      guidelines: [],
    });

    assert.equal(store.get(repoPathOne).repoPath, normalizedRepoPathOne);
    assert.deepEqual(store.get(repoPathOne).guidelines, [
      {
        id: "guideline-1",
        text: "Repo one guideline",
      },
    ]);
    assert.equal(store.get(repoPathTwo).repoPath, normalizedRepoPathTwo);
    assert.equal(store.get(repoPathTwo).draftGuideline, "Repo two draft");
  } finally {
    cleanupRootPath(rootPath);
  }
});

test("recovers safely from malformed review guideline files", () => {
  const rootPath = createRootPath();

  try {
    const repoPath = path.join(rootPath, "example-repo");
    fs.mkdirSync(repoPath, { recursive: true });
    const normalizedRepoPath = normalizePath(repoPath);
    fs.writeFileSync(
      path.join(rootPath, REVIEW_GUIDELINES_FILE_NAME),
      "{invalid json"
    );

    const store = new ReviewGuidelinesStore({ rootPath });
    assert.deepEqual(store.get(repoPath), {
      repoPath: normalizedRepoPath,
      draftGuideline: "",
      guidelines: [],
      updatedAt: null,
    });
  } finally {
    cleanupRootPath(rootPath);
  }
});
