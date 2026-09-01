/**
 * "Şablon uzantılı dosya oluşturma" (Aşama C) — yeni dosya oluştururken
 * uzantıya göre hazır, minimal bir iskelet içerik önerir. Yalnızca bir
 * başlangıç noktası; kullanıcı istediği gibi düzenleyebilir/silebilir.
 */
export interface FileTemplate {
  extension: string
  label: string
  content: string
}

export const FILE_TEMPLATES: FileTemplate[] = [
  {
    extension: ".html",
    label: "HTML",
    content: `<!doctype html>\n<html lang="tr">\n<head>\n  <meta charset="utf-8" />\n  <title>Yeni Sayfa</title>\n</head>\n<body>\n\n</body>\n</html>\n`,
  },
  {
    extension: ".js",
    label: "JavaScript",
    content: `// yeni-dosya.js\n`,
  },
  {
    extension: ".jsx",
    label: "JSX",
    content: `export default function Component() {\n  return <div></div>\n}\n`,
  },
  {
    extension: ".ts",
    label: "TypeScript",
    content: `export {}\n`,
  },
  {
    extension: ".tsx",
    label: "TSX",
    content: `export default function Component() {\n  return <div></div>\n}\n`,
  },
  {
    extension: ".py",
    label: "Python",
    content: `#!/usr/bin/env python3\n`,
  },
  {
    extension: ".json",
    label: "JSON",
    content: `{\n\n}\n`,
  },
  {
    extension: ".css",
    label: "CSS",
    content: `\n`,
  },
  {
    extension: ".md",
    label: "Markdown",
    content: `# Başlık\n`,
  },
]

export function templateForExtension(extension: string): FileTemplate | undefined {
  return FILE_TEMPLATES.find((t) => t.extension === extension)
}

/** Monaco'nun `language` prop'u için dosya uzantısından basit bir eşleme. */
const LANGUAGE_BY_EXT: Record<string, string> = {
  ".html": "html",
  ".htm": "html",
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".py": "python",
  ".json": "json",
  ".css": "css",
  ".scss": "scss",
  ".md": "markdown",
  ".yml": "yaml",
  ".yaml": "yaml",
  ".sh": "shell",
  ".sql": "sql",
  ".php": "php",
  ".xml": "xml",
  ".env": "shell",
  ".toml": "ini",
  ".ini": "ini",
}

export function languageForFileName(name: string): string {
  const lower = name.toLowerCase()
  if (lower.startsWith(".env")) return "shell"
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return "plaintext"
  return LANGUAGE_BY_EXT[lower.slice(dot)] ?? "plaintext"
}
