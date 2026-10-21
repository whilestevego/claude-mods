// Turning Claude's markdown into something worth hearing.

/** Markdown → plain spoken prose. Code blocks become `codeAs` (dropped when empty). */
export function prose(markdown: string, codeAs = ''): string {
  return markdown
    .replace(/```[\s\S]*?```/g, codeAs ? ` ${codeAs} ` : ' ')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/[*_#>|~]/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim()
}

/** "af_heart, bm_george" → ["af_heart", "bm_george"]; empty → []. */
export function voiceList(option: string): string[] {
  return option.split(',').map(v => v.trim()).filter(Boolean)
}
