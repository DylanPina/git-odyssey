from core.ai import AIEngine
from data.data_model import Commit, FileChange, DiffHunk, FileChangeStatus

# Initialize AI engine
ai = AIEngine()

# Mock commit data for testing
def create_mock_commit():
    """Create a mock commit with file changes and hunks for testing."""
    
    # Create hunks for the first file change (modified file)
    hunk1 = DiffHunk(
        old_start=1,
        old_lines=5,
        new_start=1,
        new_lines=7,
        content="""-def calculate_sum(a, b):
-    \"\"\"Calculate the sum of two numbers.\"\"\"
-    return a + b
-
+def calculate_sum(a, b):
+    \"\"\"Calculate the sum of two numbers with validation.\"\"\"
+    if not isinstance(a, (int, float)) or not isinstance(b, (int, float)):
+        raise ValueError("Arguments must be numbers")
+    return a + b
+"""
    )
    
    hunk2 = DiffHunk(
        old_start=10,
        old_lines=3,
        new_start=12,
        new_lines=5,
        content="""-def old_function():
-    return "deprecated"
-
+def new_function():
+    \"\"\"New improved function.\"\"\"
+    return "enhanced"
+    return "additional"
+"""
    )
    
    # First file change - modified file
    file_change1 = FileChange(
        old_path="src/math_utils.py",
        new_path="src/math_utils.py",
        status=FileChangeStatus.MODIFIED,
        hunks=[hunk1, hunk2],
        commit_sha="abc123def456"
    )
    
    # Create hunk for second file change (new file)
    hunk3 = DiffHunk(
        old_start=0,
        old_lines=0,
        new_start=1,
        new_lines=8,
        content="""+import logging
+from typing import List, Optional
+
+class DataProcessor:
+    \"\"\"New data processing class.\"\"\"
+    
+    def __init__(self):
+        self.logger = logging.getLogger(__name__)
+    
+    def process_data(self, data: List[str]) -> Optional[str]:
+        \"\"\"Process the input data.\"\"\"
+        if not data:
+            return None
+        return "".join(data)
+"""
    )
    
    # Second file change - new file
    file_change2 = FileChange(
        old_path="",
        new_path="src/data_processor.py",
        status=FileChangeStatus.ADDED,
        hunks=[hunk3],
        commit_sha="abc123def456"
    )
    
    # Create hunk for third file change (deleted file)
    hunk4 = DiffHunk(
        old_start=1,
        old_lines=4,
        new_start=0,
        new_lines=0,
        content="""-def deprecated_function():
-    \"\"\"This function is no longer needed.\"\"\"
-    return "old"
-"""
    )
    
    # Third file change - deleted file
    file_change3 = FileChange(
        old_path="src/old_module.py",
        new_path="",
        status=FileChangeStatus.DELETED,
        hunks=[hunk4],
        commit_sha="abc123def456"
    )
    
    # Create the commit
    commit = Commit(
        sha="abc123def456789",
        repo_url="https://github.com/test/repo",
        parents=["def456ghi789"],
        author="John Developer",
        email="john@example.com",
        time=1703123456,
        message="Refactor math utilities and add data processing capabilities",
        file_changes=[file_change1, file_change2, file_change3]
    )
    
    return commit

def test_commit_summarization():
    """Test the commit summarization functionality."""
    print("=== Testing Commit Summarization ===")
    
    # Create mock commit
    commit = create_mock_commit()
    
    print(f"Commit SHA: {commit.sha}")
    print(f"Commit Message: {commit.message}")
    print(f"Author: {commit.author}")
    print(f"Number of file changes: {len(commit.file_changes)}")
    print()
    
    # Display file changes info
    for i, file_change in enumerate(commit.file_changes, 1):
        print(f"File Change {i}:")
        print(f"  Old Path: {file_change.old_path}")
        print(f"  New Path: {file_change.new_path}")
        print(f"  Status: {file_change.status.value}")
        print(f"  Number of hunks: {len(file_change.hunks)}")
        print()
    
    try:
        print("Generating commit summary...")
        summary = ai.summarize_commit(commit)
        print("\n=== Generated Summary ===")
        print(summary)
    except Exception as e:
        print(f"Error during summarization: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_commit_summarization()
