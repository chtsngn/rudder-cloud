/**
 * "Şablon uzantılı dosya oluşturma" (Aşama C) — yeni dosya oluştururken
 * uzantıya göre hazır, minimal bir iskelet içerik önerir. Yalnızca bir
 * başlangıç noktası; kullanıcı istediği gibi düzenleyebilir/silebilir.
 */
export interface FileTemplate {
  /** Şablon kimliği: bir uzantı (`.js`) ya da tam dosya adı (`Dockerfile`). */
  extension: string
  label: string
  content: string
  /** Tam dosya adı eşleşmesi (uzantıdan önce denenir), küçük harfle. */
  fileNames?: string[]
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
  {
    extension: ".php",
    label: "PHP",
    content: `<?php\n\n`,
  },
  {
    extension: ".sh",
    label: "Shell",
    content: `#!/usr/bin/env bash\nset -euo pipefail\n\n`,
  },
  {
    extension: ".yml",
    label: "YAML",
    content: `# \n`,
  },
  {
    extension: ".env",
    label: ".env",
    fileNames: [".env", ".env.local", ".env.production", ".env.example"],
    content: `# Uygulamanın dinleyeceği port — panelde sitenin portuyla aynı olmalı.\nPORT=3000\nNODE_ENV=production\n`,
  },
  {
    extension: "Dockerfile",
    label: "Dockerfile (Node.js)",
    fileNames: ["dockerfile"],
    content: `FROM node:22-alpine\nWORKDIR /app\nCOPY package*.json ./\nRUN npm ci --omit=dev\nCOPY . .\nENV NODE_ENV=production\nEXPOSE 3000\nCMD ["npm", "start"]\n`,
  },
  {
    extension: "docker-compose.yml",
    label: "Docker Compose",
    fileNames: ["docker-compose.yml", "docker-compose.yaml", "compose.yml", "compose.yaml"],
    content: `services:\n  app:\n    build: .\n    restart: unless-stopped\n    env_file: .env\n    ports:\n      # Yalnızca localhost'a açılır; dışarıya nginx reverse proxy servis eder.\n      - "127.0.0.1:\${PORT:-3000}:\${PORT:-3000}"\n`,
  },
  {
    extension: ".gitignore",
    label: ".gitignore",
    fileNames: [".gitignore"],
    content: `node_modules/\n.env\n.env.*\n!.env.example\ndist/\nbuild/\n.next/\n*.log\n`,
  },
]

/**
 * Yazılan dosya adına en uygun şablon: önce tam ad (`Dockerfile`,
 * `docker-compose.yml`, `.env`), sonra uzantı. Bulunamazsa undefined.
 */
export function suggestTemplate(fileName: string): FileTemplate | undefined {
  const base = (fileName.split("/").pop() ?? "").trim().toLowerCase()
  if (!base) return undefined
  const byName = FILE_TEMPLATES.find((t) => t.fileNames?.includes(base))
  if (byName) return byName
  const dot = base.lastIndexOf(".")
  if (dot <= 0) return undefined
  const ext = base.slice(dot)
  return FILE_TEMPLATES.find((t) => t.extension === ext || (ext === ".yaml" && t.extension === ".yml"))
}

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
  ".dockerfile": "dockerfile",
  ".toml": "ini",
  ".ini": "ini",
}

export function languageForFileName(name: string): string {
  const lower = name.toLowerCase()
  const base = lower.split("/").pop() ?? lower
  if (base.startsWith(".env")) return "shell"
  if (base === "dockerfile" || base.startsWith("dockerfile.")) return "dockerfile"
  const dot = lower.lastIndexOf(".")
  if (dot === -1) return "plaintext"
  return LANGUAGE_BY_EXT[lower.slice(dot)] ?? "plaintext"
}
