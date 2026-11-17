const idPattern = '[0-9a-f]{8}'

export function pendingProposals(kind, output) {
  if (kind !== 'skills' && kind !== 'memory') return null
  const header = output.match(new RegExp(`^Pending ${kind} writes \\((\\d+)\\):\\n`))
  if (!header) return null
  const footer = `\n\nApply: /${kind} approve <id>   Reject: /${kind} reject <id>`
    + (kind === 'skills' ? '\nReview full diff: /skills diff <id>' : '')
  if (!output.endsWith(footer)) return null
  const body = output.slice(header[0].length, -footer.length)
  const starts = [...body.matchAll(new RegExp(`^ {2}(${idPattern})( \\[auto\\])? {2}`, 'gm'))]
  if (!starts.length || starts[0].index !== 0 || starts.length !== Number(header[1])) return null
  const items = starts.map((match, index) => ({
    id: match[1], kind, auto: Boolean(match[2]),
    gist: body.slice(match.index + match[0].length, starts[index + 1]?.index).trimEnd(),
  }))
  return new Set(items.map(item => item.id)).size === items.length ? items : null
}

export function skillProposal(output) {
  const prefix = output.match(new RegExp(`^# Pending skill write (${idPattern}): ([^\\n]+)\\n\\n`))
  if (!prefix) return null
  const content = output.slice(prefix[0].length)
  if (!content.trim()) return null
  return { id: prefix[1], kind: 'skills', gist: prefix[2], content }
}

export function skillSubject(gist) {
  const match = gist.match(/^(create|rewrite|patch|delete) '([^'\n]+)'/)
  if (match) return { operation: match[1], name: match[2] }
  const file = gist.match(/^(write|remove) .+ (?:in|from) '([^'\n]+)'$/)
  return file ? { operation: file[1], name: file[2] } : { operation: 'change', name: '' }
}

// A simple patch has one block. Larger changes keep their original order in
// a full, selectable preview so unrelated lines cannot look like a pair.
export function pairedSkillLines(content) {
  const lines = content.split('\n')
  if (!lines[0]?.startsWith('--- ') || !lines[1]?.startsWith('+++ ')) return null
  if (!/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@/.test(lines[2] || '')) return null
  const change = lines.slice(3)
  if (change.some(line => line.startsWith('@@') || line.startsWith('--- ') || line.startsWith('+++ '))) return null
  const before = change.filter(line => line.startsWith('-')).map(line => line.slice(1))
  const after = change.filter(line => line.startsWith('+')).map(line => line.slice(1))
  if (before.length !== 1 || after.length !== 1) return null
  if (change.indexOf('+' + after[0]) !== change.indexOf('-' + before[0]) + 1) return null
  return { before: before[0], after: after[0] }
}

export function memoryProposal(record, id) {
  if (record?.id !== id || record.subsystem !== 'memory') return null
  const payload = record.payload
  if (!payload || !['user', 'memory'].includes(payload.target) || record.action !== payload.action) return null
  const operations = payload.action === 'batch' ? payload.operations : [payload]
  if (!Array.isArray(operations) || !operations.length) return null
  const changes = []
  for (const op of operations) {
    const { action, old_text: old, matched_entry: entry } = op || {}
    const content = op?.content ?? op?.new_text
    if (action === 'add' && typeof content === 'string' && content.trim()) {
      changes.push({ action, content })
      continue
    }
    if (typeof entry !== 'string' || !entry.trim()) return null
    if (action === 'remove') changes.push({ action, entry })
    else if (action === 'replace' && typeof content === 'string') changes.push({ action, entry, content })
    else if (action === 'patch' && typeof old === 'string' && old.trim() && typeof content === 'string') {
      changes.push({ action, entry, old, content })
    } else return null
  }
  return { target: payload.target, changes }
}
