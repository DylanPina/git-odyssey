import ast
import re
import tree_sitter_typescript
from collections import Counter
from dataclasses import dataclass, field
from typing import Any

from data.schema import FileChangeStatus
from infrastructure.ai_runtime import AST_ENABLED_LANGUAGES, AST_SCHEMA_VERSION
from utils.logger import logger

from tree_sitter import Language, Parser

SUPPORTED_AST_EXTENSIONS = {
    ".py": "python",
    ".ts": "typescript",
    ".tsx": "tsx",
}
_CALL_PATTERN = re.compile(r"([A-Za-z_][\w\.]*)\s*\(")
_IMPORT_PATTERN = re.compile(
    r"(?:from\s+([A-Za-z_][\w\.]*)\s+import|import\s+([A-Za-z_][\w\., ]*))"
)
_TS_IMPORT_EXPORT_PATTERN = re.compile(
    r"\b(?:import|export)\b\s+([A-Za-z_][\w]*)", re.IGNORECASE
)
_STRING_LITERAL_PATTERN = re.compile(r"(['\"])(?:(?=(\\?))\2.)*?\1")
_NUMBER_LITERAL_PATTERN = re.compile(r"\b\d+(?:\.\d+)?\b")
_WHITESPACE_PATTERN = re.compile(r"\s+")


@dataclass
class ASTMatch:
    language: str
    path: str
    hunk_index: int
    symbol_path: str
    symbol_kind: str
    enclosing_symbol: str | None
    changed_lines: tuple[int, int]
    change_descriptors: list[str] = field(default_factory=list)
    call_names: set[str] = field(default_factory=set)
    import_names: set[str] = field(default_factory=set)
    export_names: set[str] = field(default_factory=set)
    type_names: set[str] = field(default_factory=set)
    motifs: set[str] = field(default_factory=set)


@dataclass
class ASTExtractionResult:
    language: str
    file_path: str
    file_summary: str | None
    hunk_summaries: dict[int, str]


@dataclass
class _PythonSymbol:
    path: str
    kind: str
    start_line: int
    end_line: int
    node: ast.AST
    enclosing_symbol: str | None = None


@dataclass
class _TSSymbol:
    path: str
    kind: str
    start_line: int
    end_line: int
    node: Any
    enclosing_symbol: str | None = None


def normalize_ast_summary_text(value: str) -> str:
    normalized = _STRING_LITERAL_PATTERN.sub("<str>", value)
    normalized = _NUMBER_LITERAL_PATTERN.sub("<num>", normalized)
    normalized = _WHITESPACE_PATTERN.sub(" ", normalized).strip()
    return normalized


def _path_language(path: str | None) -> str | None:
    if not path:
        return None
    lower = path.lower()
    for extension, language in SUPPORTED_AST_EXTENSIONS.items():
        if lower.endswith(extension):
            return language
    return None


def _strip_diff_prefix(line: str) -> str:
    if line[:1] in {"+", "-", " "}:
        return line[1:]
    return line


def _split_diff_sections(
    diff_text: str | None,
) -> tuple[list[str], list[str], list[str]]:
    added: list[str] = []
    removed: list[str] = []
    context: list[str] = []
    if not diff_text:
        return added, removed, context

    for raw_line in diff_text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if not raw_line or raw_line.startswith("@@"):
            continue
        prefix = raw_line[:1]
        body = _strip_diff_prefix(raw_line)
        if prefix == "+":
            added.append(body)
        elif prefix == "-":
            removed.append(body)
        else:
            context.append(body)
    return added, removed, context


def _extract_changed_line_span(hunk: Any, status: Any) -> tuple[int, int]:
    if status == FileChangeStatus.DELETED:
        start_line = max(1, int(getattr(hunk, "old_start", 1) or 1))
        line_count = max(1, int(getattr(hunk, "old_lines", 0) or 0))
    else:
        start_line = max(1, int(getattr(hunk, "new_start", 1) or 1))
        line_count = max(1, int(getattr(hunk, "new_lines", 0) or 0))
    return start_line, start_line + line_count - 1


def _extract_diff_calls(lines: list[str]) -> set[str]:
    calls: set[str] = set()
    for line in lines:
        for match in _CALL_PATTERN.findall(normalize_ast_summary_text(line)):
            calls.add(match.split(".")[-1])
    return calls


def _extract_diff_imports(lines: list[str]) -> set[str]:
    imports: set[str] = set()
    for line in lines:
        normalized = normalize_ast_summary_text(line)
        for match in _IMPORT_PATTERN.finditer(normalized):
            left, right = match.groups()
            if left:
                imports.add(left)
            if right:
                imports.update(
                    part.strip() for part in right.split(",") if part.strip()
                )
        for ts_match in _TS_IMPORT_EXPORT_PATTERN.findall(normalized):
            imports.add(ts_match)
    return imports


def _classify_diff_changes(
    language: str,
    symbol_kind: str,
    added_lines: list[str],
    removed_lines: list[str],
) -> tuple[list[str], set[str]]:
    descriptors: list[str] = []
    motifs: set[str] = set()
    combined = "\n".join([*added_lines, *removed_lines])

    def add_descriptor(value: str) -> None:
        if value not in descriptors:
            descriptors.append(value)

    if re.search(r"\b(if|elif|else|switch|case)\b", combined):
        motifs.add("conditional")
        add_descriptor("conditional changed")
    if re.search(r"\breturn\b", combined):
        motifs.add("return")
        add_descriptor("return changed")
    if re.search(r"\b(import|from|export)\b", combined):
        motifs.add("import_export")
        add_descriptor("import/export changed")
    if re.search(r"\b(class|interface|type|enum)\b", combined) or symbol_kind in {
        "class",
        "interface",
        "type_alias",
        "enum",
    }:
        motifs.add("shape")
        add_descriptor("class/interface shape changed")
    if language in {"typescript", "tsx"} and re.search(
        r"\b(setState|useState|dispatch|set[A-Z][A-Za-z0-9_]*)\b",
        combined,
    ):
        motifs.add("state")
        add_descriptor("state update changed")
    if re.search(r"\b(def|async def|function|=>)\b", combined):
        motifs.add("signature")
        add_descriptor("signature change")
    return descriptors, motifs


def _sorted_join(values: set[str]) -> str | None:
    if not values:
        return None
    return ", ".join(sorted(values))


def _render_hunk_summary(match: ASTMatch) -> str:
    lines = [
        f"Language: {match.language}",
        f"Path: {match.path}",
        f"Symbol: {match.symbol_path}",
        f"Kind: {match.symbol_kind}",
    ]
    if match.enclosing_symbol:
        lines.append(f"Enclosing Symbol: {match.enclosing_symbol}")
    if match.change_descriptors:
        lines.append(f"Changes: {'; '.join(match.change_descriptors)}")
    if match.call_names:
        lines.append(f"Calls: {_sorted_join(match.call_names)}")
    if match.import_names:
        lines.append(f"Imports: {_sorted_join(match.import_names)}")
    if match.export_names:
        lines.append(f"Exports: {_sorted_join(match.export_names)}")
    if match.type_names:
        lines.append(f"Types: {_sorted_join(match.type_names)}")
    if match.motifs:
        lines.append(f"Motifs: {_sorted_join(match.motifs)}")
    return normalize_ast_summary_text("\n".join(lines))


def _render_file_summary(
    language: str, file_path: str, matches: list[ASTMatch]
) -> str | None:
    if not matches:
        return None
    symbol_counts = Counter(match.symbol_kind for match in matches)
    top_symbols = sorted({match.symbol_path for match in matches if match.symbol_path})[
        :8
    ]
    imports = set().union(*(match.import_names for match in matches))
    exports = set().union(*(match.export_names for match in matches))
    types = set().union(*(match.type_names for match in matches))
    motifs = set().union(*(match.motifs for match in matches))
    ordered_descriptors = list(
        dict.fromkeys(
            descriptor for match in matches for descriptor in match.change_descriptors
        )
    )
    lines = [
        f"Language: {language}",
        f"Path: {file_path}",
        f"Top Symbols: {', '.join(top_symbols)}"
        if top_symbols
        else "Top Symbols: <none>",
        "Symbol Counts: "
        + ", ".join(f"{kind}={count}" for kind, count in sorted(symbol_counts.items())),
    ]
    if imports or exports:
        lines.append(f"Imports/Exports: {_sorted_join(imports | exports)}")
    if types:
        lines.append(f"Types: {_sorted_join(types)}")
    if motifs:
        lines.append(f"Structural Motifs: {_sorted_join(motifs)}")
    if ordered_descriptors:
        lines.append(f"Changes: {'; '.join(ordered_descriptors[:8])}")
    return normalize_ast_summary_text("\n".join(lines))


class ASTSummaryExtractor:
    def __init__(self) -> None:
        self.ast_schema_version = AST_SCHEMA_VERSION
        self.supported_languages = AST_ENABLED_LANGUAGES
        self._ts_parser_cache: dict[str, Any] = {}

    def populate_repo(self, repo: Any) -> None:
        for commit in getattr(repo, "commits", {}).values():
            for file_change in getattr(commit, "file_changes", []):
                self.populate_file_change(file_change)

    def populate_file_change(self, file_change: Any) -> None:
        file_path = getattr(file_change, "new_path", None) or getattr(
            file_change, "old_path", None
        )
        language = _path_language(file_path)
        if language is None:
            return

        result = self.extract_file_change(file_change, language=language)
        if result is None:
            return

        file_change.ast_summary = result.file_summary
        for index, hunk in enumerate(getattr(file_change, "hunks", [])):
            hunk.ast_summary = result.hunk_summaries.get(index)

    def extract_file_change(
        self,
        file_change: Any,
        *,
        language: str | None = None,
    ) -> ASTExtractionResult | None:
        file_path = getattr(file_change, "new_path", None) or getattr(
            file_change, "old_path", None
        )
        language = language or _path_language(file_path)
        if language is None or file_path is None:
            return None

        snapshot = getattr(file_change, "snapshot", None)
        snapshot_text = getattr(snapshot, "content", "") if snapshot is not None else ""

        if snapshot_text.strip():
            if language == "python":
                matches = self._extract_python_matches(
                    file_change, file_path, snapshot_text
                )
            else:
                matches = self._extract_typescript_matches(
                    file_change, file_path, snapshot_text, language
                )
        else:
            matches = []

        if not matches:
            matches = self._extract_fallback_matches(
                file_change,
                file_path=file_path,
                language=language,
            )
            if not matches:
                return None

        file_summary = _render_file_summary(language, file_path, matches)
        hunk_summaries = {
            match.hunk_index: _render_hunk_summary(match) for match in matches
        }
        return ASTExtractionResult(
            language=language,
            file_path=file_path,
            file_summary=file_summary,
            hunk_summaries=hunk_summaries,
        )

    def _extract_python_matches(
        self,
        file_change: Any,
        file_path: str,
        snapshot_text: str,
    ) -> list[ASTMatch]:
        try:
            module = ast.parse(snapshot_text)
        except SyntaxError as exc:
            logger.debug("Python AST parse failed for %s: %s", file_path, exc)
            return []

        symbols = self._collect_python_symbols(module)
        status = getattr(file_change, "status", FileChangeStatus.MODIFIED)
        matches: list[ASTMatch] = []

        for hunk_index, hunk in enumerate(getattr(file_change, "hunks", [])):
            start_line, end_line = _extract_changed_line_span(hunk, status)
            symbol = self._resolve_python_symbol(symbols, start_line, end_line)
            if symbol is None:
                continue
            added_lines, removed_lines, _ = _split_diff_sections(
                getattr(hunk, "content", None)
            )
            added_calls = _extract_diff_calls(added_lines)
            removed_calls = _extract_diff_calls(removed_lines)
            descriptors, motifs = _classify_diff_changes(
                "python", symbol.kind, added_lines, removed_lines
            )
            for call_name in sorted(added_calls - removed_calls):
                descriptors.append(f"added call {call_name}")
            for call_name in sorted(removed_calls - added_calls):
                descriptors.append(f"removed call {call_name}")
            matches.append(
                ASTMatch(
                    language="python",
                    path=file_path,
                    hunk_index=hunk_index,
                    symbol_path=symbol.path,
                    symbol_kind=symbol.kind,
                    enclosing_symbol=symbol.enclosing_symbol,
                    changed_lines=(start_line, end_line),
                    change_descriptors=list(dict.fromkeys(descriptors)),
                    call_names=self._extract_python_call_names(symbol.node)
                    | added_calls
                    | removed_calls,
                    import_names=self._extract_python_import_names(symbol.node)
                    | _extract_diff_imports(added_lines + removed_lines),
                    export_names=set(),
                    type_names=self._extract_python_type_names(symbol.node),
                    motifs=motifs,
                )
            )
        return matches

    def _collect_python_symbols(
        self,
        node: ast.AST,
        *,
        prefix: tuple[str, ...] = (),
        enclosing_symbol: str | None = None,
    ) -> list[_PythonSymbol]:
        symbols: list[_PythonSymbol] = []
        for child in ast.iter_child_nodes(node):
            name: str | None = None
            kind: str | None = None
            next_prefix = prefix
            next_enclosing = enclosing_symbol
            if isinstance(child, ast.ClassDef):
                name = child.name
                kind = "class"
            elif isinstance(child, ast.FunctionDef):
                name = child.name
                kind = "method" if prefix else "function"
            elif isinstance(child, ast.AsyncFunctionDef):
                name = child.name
                kind = "method" if prefix else "async_function"
            elif isinstance(child, ast.Assign) and not prefix:
                targets = [
                    target.id
                    for target in child.targets
                    if isinstance(target, ast.Name)
                ]
                if targets:
                    name = targets[0]
                    kind = "module_assignment"
            elif (
                isinstance(child, ast.AnnAssign)
                and not prefix
                and isinstance(child.target, ast.Name)
            ):
                name = child.target.id
                kind = "module_assignment"

            if name and kind:
                path = ".".join((*prefix, name))
                start_line = int(getattr(child, "lineno", 1) or 1)
                end_line = int(getattr(child, "end_lineno", start_line) or start_line)
                symbols.append(
                    _PythonSymbol(
                        path=path,
                        kind=kind,
                        start_line=start_line,
                        end_line=end_line,
                        node=child,
                        enclosing_symbol=enclosing_symbol,
                    )
                )
                next_prefix = (*prefix, name)
                next_enclosing = path
            symbols.extend(
                self._collect_python_symbols(
                    child,
                    prefix=next_prefix,
                    enclosing_symbol=next_enclosing,
                )
            )
        return symbols

    def _resolve_python_symbol(
        self, symbols: list[_PythonSymbol], start_line: int, end_line: int
    ) -> _PythonSymbol | None:
        overlapping = [
            symbol
            for symbol in symbols
            if not (symbol.end_line < start_line or symbol.start_line > end_line)
        ]
        if not overlapping:
            return None
        return min(
            overlapping,
            key=lambda symbol: (symbol.end_line - symbol.start_line, symbol.path),
        )

    def _extract_python_call_names(self, node: ast.AST) -> set[str]:
        names: set[str] = set()
        for child in ast.walk(node):
            if not isinstance(child, ast.Call):
                continue
            target = child.func
            if isinstance(target, ast.Name):
                names.add(target.id)
            elif isinstance(target, ast.Attribute):
                names.add(target.attr)
        return names

    def _extract_python_import_names(self, node: ast.AST) -> set[str]:
        names: set[str] = set()
        for child in ast.walk(node):
            if isinstance(child, ast.Import):
                names.update(alias.name for alias in child.names if alias.name)
            elif isinstance(child, ast.ImportFrom):
                if child.module:
                    names.add(child.module)
                names.update(alias.name for alias in child.names if alias.name)
        return names

    def _extract_python_type_names(self, node: ast.AST) -> set[str]:
        names: set[str] = set()
        for child in ast.walk(node):
            annotation = getattr(child, "annotation", None)
            if isinstance(annotation, ast.Name):
                names.add(annotation.id)
            returns = getattr(child, "returns", None)
            if isinstance(returns, ast.Name):
                names.add(returns.id)
        return names

    def _extract_typescript_matches(
        self,
        file_change: Any,
        file_path: str,
        snapshot_text: str,
        language: str,
    ) -> list[ASTMatch]:
        parser = self._get_ts_parser(language)
        if parser is None:
            return []

        source = snapshot_text.encode("utf-8")
        try:
            tree = parser.parse(source)
        except Exception as exc:
            logger.debug("Tree-sitter parse failed for %s: %s", file_path, exc)
            return []

        symbols = self._collect_ts_symbols(tree.root_node, source)
        status = getattr(file_change, "status", FileChangeStatus.MODIFIED)
        matches: list[ASTMatch] = []

        for hunk_index, hunk in enumerate(getattr(file_change, "hunks", [])):
            start_line, end_line = _extract_changed_line_span(hunk, status)
            symbol = self._resolve_ts_symbol(symbols, start_line, end_line)
            if symbol is None:
                continue
            added_lines, removed_lines, _ = _split_diff_sections(
                getattr(hunk, "content", None)
            )
            added_calls = _extract_diff_calls(added_lines)
            removed_calls = _extract_diff_calls(removed_lines)
            descriptors, motifs = _classify_diff_changes(
                language, symbol.kind, added_lines, removed_lines
            )
            for call_name in sorted(added_calls - removed_calls):
                descriptors.append(f"added call {call_name}")
            for call_name in sorted(removed_calls - added_calls):
                descriptors.append(f"removed call {call_name}")
            call_names, import_names, export_names, type_names = (
                self._extract_ts_features(symbol.node, source)
            )
            matches.append(
                ASTMatch(
                    language=language,
                    path=file_path,
                    hunk_index=hunk_index,
                    symbol_path=symbol.path,
                    symbol_kind=symbol.kind,
                    enclosing_symbol=symbol.enclosing_symbol,
                    changed_lines=(start_line, end_line),
                    change_descriptors=list(dict.fromkeys(descriptors)),
                    call_names=call_names | added_calls | removed_calls,
                    import_names=import_names
                    | _extract_diff_imports(added_lines + removed_lines),
                    export_names=export_names,
                    type_names=type_names,
                    motifs=motifs,
                )
            )
        return matches

    def _get_ts_parser(self, language: str) -> Any | None:
        if Parser is None or Language is None or tree_sitter_typescript is None:
            return None

        cached = self._ts_parser_cache.get(language)
        if cached is not None:
            return cached

        language_factory = (
            tree_sitter_typescript.language_tsx
            if language == "tsx"
            else tree_sitter_typescript.language_typescript
        )
        parser = Parser()
        parser.language = Language(language_factory())
        self._ts_parser_cache[language] = parser
        return parser

    def _collect_ts_symbols(
        self,
        node: Any,
        source: bytes,
        *,
        prefix: tuple[str, ...] = (),
        enclosing_symbol: str | None = None,
    ) -> list[_TSSymbol]:
        symbols: list[_TSSymbol] = []
        for child in node.children:
            symbol = self._make_ts_symbol(child, source, prefix, enclosing_symbol)
            next_prefix = prefix
            next_enclosing = enclosing_symbol
            if symbol is not None:
                symbols.append(symbol)
                next_prefix = tuple(symbol.path.split("."))
                next_enclosing = symbol.path
            symbols.extend(
                self._collect_ts_symbols(
                    child,
                    source,
                    prefix=next_prefix,
                    enclosing_symbol=next_enclosing,
                )
            )
        return symbols

    def _make_ts_symbol(
        self,
        node: Any,
        source: bytes,
        prefix: tuple[str, ...],
        enclosing_symbol: str | None,
    ) -> _TSSymbol | None:
        kind_map = {
            "function_declaration": "function",
            "method_definition": "method",
            "class_declaration": "class",
            "interface_declaration": "interface",
            "type_alias_declaration": "type_alias",
            "enum_declaration": "enum",
            "lexical_declaration": "variable",
            "variable_declarator": "variable",
        }
        if node.type not in kind_map:
            return None

        name_node = node.child_by_field_name("name")
        if name_node is None and node.type == "lexical_declaration":
            for child in node.children:
                if child.type == "variable_declarator":
                    name_node = child.child_by_field_name("name")
                    if name_node is not None:
                        node = child
                        break
        if name_node is None:
            return None

        name = source[name_node.start_byte : name_node.end_byte].decode(
            "utf-8", "ignore"
        )
        if not name:
            return None

        path = ".".join((*prefix, name))
        return _TSSymbol(
            path=path,
            kind=kind_map[node.type],
            start_line=int(node.start_point.row) + 1,
            end_line=int(node.end_point.row) + 1,
            node=node,
            enclosing_symbol=enclosing_symbol,
        )

    def _resolve_ts_symbol(
        self, symbols: list[_TSSymbol], start_line: int, end_line: int
    ) -> _TSSymbol | None:
        overlapping = [
            symbol
            for symbol in symbols
            if not (symbol.end_line < start_line or symbol.start_line > end_line)
        ]
        if not overlapping:
            return None
        return min(
            overlapping,
            key=lambda symbol: (symbol.end_line - symbol.start_line, symbol.path),
        )

    def _extract_ts_features(
        self, node: Any, source: bytes
    ) -> tuple[set[str], set[str], set[str], set[str]]:
        call_names: set[str] = set()
        import_names: set[str] = set()
        export_names: set[str] = set()
        type_names: set[str] = set()

        def visit(current: Any) -> None:
            if current.type == "call_expression":
                function_node = (
                    current.child_by_field_name("function") or current.children[0]
                )
                name = source[function_node.start_byte : function_node.end_byte].decode(
                    "utf-8", "ignore"
                )
                if name:
                    call_names.add(name.split(".")[-1])
            elif current.type in {"import_statement", "import_clause"}:
                text = source[current.start_byte : current.end_byte].decode(
                    "utf-8", "ignore"
                )
                import_names.update(_extract_diff_imports([text]))
            elif current.type in {"export_statement", "export_clause"}:
                text = source[current.start_byte : current.end_byte].decode(
                    "utf-8", "ignore"
                )
                export_names.update(_extract_diff_imports([text]))
            elif current.type in {
                "type_identifier",
                "predefined_type",
                "interface_declaration",
                "type_alias_declaration",
            }:
                text = source[current.start_byte : current.end_byte].decode(
                    "utf-8", "ignore"
                )
                if text:
                    type_names.add(text)

            for child in current.children:
                visit(child)

        visit(node)
        return call_names, import_names, export_names, type_names

    def _extract_fallback_matches(
        self,
        file_change: Any,
        *,
        file_path: str,
        language: str,
    ) -> list[ASTMatch]:
        status = getattr(file_change, "status", FileChangeStatus.MODIFIED)
        matches: list[ASTMatch] = []
        for hunk_index, hunk in enumerate(getattr(file_change, "hunks", [])):
            added_lines, removed_lines, context_lines = _split_diff_sections(
                getattr(hunk, "content", None)
            )
            candidate_lines = added_lines or removed_lines or context_lines
            if not candidate_lines:
                continue
            symbol_name, symbol_kind = self._infer_symbol_from_hunk(
                candidate_lines,
                language=language,
            )
            descriptors, motifs = _classify_diff_changes(
                language, symbol_kind, added_lines, removed_lines
            )
            start_line, end_line = _extract_changed_line_span(hunk, status)
            matches.append(
                ASTMatch(
                    language=language,
                    path=file_path,
                    hunk_index=hunk_index,
                    symbol_path=symbol_name,
                    symbol_kind=symbol_kind,
                    enclosing_symbol=None,
                    changed_lines=(start_line, end_line),
                    change_descriptors=descriptors,
                    call_names=_extract_diff_calls(added_lines + removed_lines),
                    import_names=_extract_diff_imports(added_lines + removed_lines),
                    export_names=set(),
                    type_names=set(),
                    motifs=motifs,
                )
            )
        return matches

    def _infer_symbol_from_hunk(
        self, lines: list[str], *, language: str
    ) -> tuple[str, str]:
        joined = "\n".join(lines)
        patterns = [
            (r"\basync\s+def\s+([A-Za-z_][A-Za-z0-9_]*)", "async_function"),
            (r"\bdef\s+([A-Za-z_][A-Za-z0-9_]*)", "function"),
            (r"\bclass\s+([A-Za-z_][A-Za-z0-9_]*)", "class"),
            (r"\bfunction\s+([A-Za-z_][A-Za-z0-9_]*)", "function"),
            (r"\binterface\s+([A-Za-z_][A-Za-z0-9_]*)", "interface"),
            (r"\btype\s+([A-Za-z_][A-Za-z0-9_]*)", "type_alias"),
            (r"\benum\s+([A-Za-z_][A-Za-z0-9_]*)", "enum"),
            (r"\bconst\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(", "variable"),
        ]
        for pattern, kind in patterns:
            match = re.search(pattern, joined)
            if match:
                return match.group(1), kind
        return "<module>", "module_assignment" if language == "python" else "variable"
