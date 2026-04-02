import unittest
from types import SimpleNamespace

from core.ast_extractor import ASTSummaryExtractor, normalize_ast_summary_text
from data.schema import FileChangeStatus


def build_file_change(
    *,
    path: str,
    snapshot_text: str,
    hunk_content: str,
    status=FileChangeStatus.MODIFIED,
    old_start: int = 1,
    old_lines: int = 1,
    new_start: int = 1,
    new_lines: int = 1,
):
    hunk = SimpleNamespace(
        content=hunk_content,
        old_start=old_start,
        old_lines=old_lines,
        new_start=new_start,
        new_lines=new_lines,
        ast_summary=None,
    )
    snapshot = SimpleNamespace(content=snapshot_text)
    return SimpleNamespace(
        old_path=path,
        new_path=path,
        status=status,
        snapshot=snapshot,
        hunks=[hunk],
        ast_summary=None,
    )


class ASTExtractorTests(unittest.TestCase):
    def setUp(self) -> None:
        self.extractor = ASTSummaryExtractor()

    def test_python_signature_change_produces_structural_summary(self) -> None:
        file_change = build_file_change(
            path="backend/src/example.py",
            snapshot_text=(
                "def greet(name: str, title: str) -> str:\n"
                "    return format_name(name, title)\n"
            ),
            hunk_content=(
                "@@ -1,2 +1,2 @@\n"
                "-def greet(name: str) -> str:\n"
                "+def greet(name: str, title: str) -> str:\n"
            ),
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNotNone(result)
        self.assertIn("Language: python", result.file_summary or "")
        self.assertIn("Symbol: greet", result.hunk_summaries[0])
        self.assertIn("signature change", result.hunk_summaries[0])

    def test_python_method_call_change_tracks_symbol_path(self) -> None:
        file_change = build_file_change(
            path="backend/src/service.py",
            snapshot_text=(
                "class Service:\n"
                "    def handle(self, token: str) -> bool:\n"
                "        return use_cache(token)\n"
            ),
            hunk_content=(
                "@@ -2,1 +2,1 @@\n"
                "-        return load_token(token)\n"
                "+        return use_cache(token)\n"
            ),
            old_start=2,
            new_start=2,
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNotNone(result)
        self.assertIn("Symbol: Service.handle", result.hunk_summaries[0])
        self.assertIn("added call use_cache", result.hunk_summaries[0])

    def test_typescript_component_change_uses_tree_sitter_when_available(self) -> None:
        file_change = build_file_change(
            path="frontend/src/SearchPanel.tsx",
            snapshot_text=(
                "export function SearchPanel() {\n"
                "  const [query, setQuery] = useState('ready');\n"
                "  if (query) {\n"
                "    dispatch(loadResults(query));\n"
                "  }\n"
                "  return <div>{query}</div>;\n"
                "}\n"
            ),
            hunk_content=(
                "@@ -1,4 +1,6 @@\n"
                "+  const [query, setQuery] = useState('ready');\n"
                "+  if (query) {\n"
                "+    dispatch(loadResults(query));\n"
                "+  }\n"
            ),
            old_start=1,
            new_start=1,
            old_lines=4,
            new_lines=6,
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNotNone(result)
        self.assertIn("Language: tsx", result.file_summary or "")
        self.assertIn("Symbol: SearchPanel", result.hunk_summaries[0])
        self.assertTrue(
            "dispatch" in result.hunk_summaries[0]
            or "useState" in result.hunk_summaries[0]
        )

    def test_tsx_interface_change_captures_interface_symbol(self) -> None:
        file_change = build_file_change(
            path="frontend/src/Panel.tsx",
            snapshot_text=(
                "interface Props {\n"
                "  enabled: boolean;\n"
                "  label: string;\n"
                "}\n"
                "export function Panel(props: Props) {\n"
                "  return <div>{props.label}</div>;\n"
                "}\n"
            ),
            hunk_content=(
                "@@ -1,3 +1,3 @@\n"
                "-  title: string;\n"
                "+  label: string;\n"
            ),
            old_start=1,
            new_start=1,
            old_lines=3,
            new_lines=3,
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNotNone(result)
        self.assertIn("Symbol: Props", result.hunk_summaries[0])
        self.assertIn("Kind: interface", result.hunk_summaries[0])

    def test_import_export_only_change_uses_fallback_summary(self) -> None:
        file_change = build_file_change(
            path="frontend/src/selectors.ts",
            snapshot_text=(
                "import { useMemo } from 'react';\n"
                "export const selectFoo = () => true;\n"
            ),
            hunk_content=(
                "@@ -1,2 +1,2 @@\n"
                "-import { useEffect } from 'react';\n"
                "+import { useMemo } from 'react';\n"
                "-export const selectFoo = () => false;\n"
                "+export const selectFoo = () => true;\n"
            ),
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNotNone(result)
        self.assertIn("import/export changed", result.hunk_summaries[0])

    def test_unsupported_extension_skips_ast_extraction(self) -> None:
        file_change = build_file_change(
            path="README.md",
            snapshot_text="# Title\n",
            hunk_content="+ docs\n",
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNone(result)

    def test_parser_failure_with_no_recoverable_structure_returns_none(self) -> None:
        file_change = build_file_change(
            path="backend/src/broken.py",
            snapshot_text="def broken(",
            hunk_content="",
        )

        result = self.extractor.extract_file_change(file_change)

        self.assertIsNone(result)

    def test_canonicalization_normalizes_literals(self) -> None:
        normalized = normalize_ast_summary_text('Calls: demo("secret", 123)')

        self.assertEqual(normalized, "Calls: demo(<str>, <num>)")

    def test_equivalent_shapes_with_different_literals_produce_same_summary(self) -> None:
        first = build_file_change(
            path="backend/src/a.py",
            snapshot_text="def greet() -> str:\n    return format_name('alpha', 1)\n",
            hunk_content="+    return format_name('alpha', 1)\n",
            old_start=2,
            new_start=2,
        )
        second = build_file_change(
            path="backend/src/a.py",
            snapshot_text="def greet() -> str:\n    return format_name('beta', 2)\n",
            hunk_content="+    return format_name('beta', 2)\n",
            old_start=2,
            new_start=2,
        )

        first_result = self.extractor.extract_file_change(first)
        second_result = self.extractor.extract_file_change(second)

        self.assertEqual(first_result.hunk_summaries[0], second_result.hunk_summaries[0])


if __name__ == "__main__":
    unittest.main()
