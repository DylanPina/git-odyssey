import type * as MonacoEditor from "monaco-editor";

let themeRegistered = false;

export function registerGitOdysseyMonacoTheme(
  monaco: typeof MonacoEditor
) {
  if (themeRegistered) {
    return;
  }

  monaco.editor.defineTheme("git-odyssey-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "focusBorder": "#7aa2ff",
      "editor.background": "#171b20",
      "editor.foreground": "#e8eaed",
      "editorLineNumber.foreground": "#59616b",
      "editorLineNumber.activeForeground": "#cfd6de",
      "editorGutter.background": "#171b20",
      "editorCursor.foreground": "#7aa2ff",
      "editor.selectionBackground": "#223352",
      "editor.selectionHighlightBackground": "#22335288",
      "editor.lineHighlightBackground": "#ffffff05",
      "editorWidget.background": "#1d232a",
      "editorWidget.border": "#313842",
      "editorHoverWidget.background": "#1d232a",
      "editorHoverWidget.border": "#313842",
      "editorIndentGuide.background": "#ffffff08",
      "editorIndentGuide.activeBackground": "#ffffff14",
      "minimap.background": "#171b20",
      "scrollbarSlider.background": "#ffffff12",
      "scrollbarSlider.hoverBackground": "#ffffff1d",
      "scrollbarSlider.activeBackground": "#ffffff26",
      "diffEditor.diagonalFill": "#00000000",
      "diffEditor.insertedTextBackground": "#1d47308a",
      "diffEditor.removedTextBackground": "#5a27278a",
      "diffEditor.insertedLineBackground": "#17322255",
      "diffEditor.removedLineBackground": "#371b1b55",
      "diffEditor.border": "#00000000",
    },
  });

  themeRegistered = true;
}
