const fs = require("fs");
const path = require("path");

const MAX_RECENT_PROJECTS = 8;

function normalizePath(targetPath) {
  if (!targetPath) {
    return null;
  }

  try {
    return fs.realpathSync.native(path.resolve(targetPath));
  } catch (_error) {
    return path.resolve(targetPath);
  }
}

function hasGitMarker(candidatePath) {
  const gitPath = path.join(candidatePath, ".git");
  return fs.existsSync(gitPath);
}

function isBareRepoRoot(candidatePath) {
  return (
    fs.existsSync(path.join(candidatePath, "HEAD")) &&
    fs.existsSync(path.join(candidatePath, "objects")) &&
    fs.existsSync(path.join(candidatePath, "refs"))
  );
}

function findGitProjectRoot(startPath) {
  let currentPath = normalizePath(startPath);
  if (!currentPath || !fs.existsSync(currentPath)) {
    return null;
  }

  if (fs.statSync(currentPath).isFile()) {
    currentPath = path.dirname(currentPath);
  }

  while (true) {
    if (hasGitMarker(currentPath) || isBareRepoRoot(currentPath)) {
      return currentPath;
    }

    const parentPath = path.dirname(currentPath);
    if (parentPath === currentPath) {
      return null;
    }

    currentPath = parentPath;
  }
}

function getGitProjectName(projectPath) {
  const normalizedPath = normalizePath(projectPath) ?? projectPath;
  const name = path.basename(normalizedPath);
  return name.endsWith(".git") ? name.slice(0, -4) : name;
}

function toGitProjectSummary(projectPath, lastOpenedAt = new Date().toISOString()) {
  const normalizedPath = findGitProjectRoot(projectPath);
  if (!normalizedPath) {
    return null;
  }

  return {
    path: normalizedPath,
    name: getGitProjectName(normalizedPath),
    lastOpenedAt,
  };
}

function dedupeRecentProjects(projects) {
  const byPath = new Map();

  for (const project of projects) {
    const summary = toGitProjectSummary(project.path, project.lastOpenedAt);
    if (!summary) {
      continue;
    }

    const existing = byPath.get(summary.path);
    if (!existing || existing.lastOpenedAt < summary.lastOpenedAt) {
      byPath.set(summary.path, summary);
    }
  }

  return Array.from(byPath.values())
    .sort((left, right) => right.lastOpenedAt.localeCompare(left.lastOpenedAt))
    .slice(0, MAX_RECENT_PROJECTS);
}

module.exports = {
  MAX_RECENT_PROJECTS,
  dedupeRecentProjects,
  findGitProjectRoot,
  normalizePath,
  toGitProjectSummary,
};
