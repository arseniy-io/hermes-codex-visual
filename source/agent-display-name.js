// Codex Desktop 26.1111.2228.0, ZpsE.o: display the final non-root path
// segment, replacing separators and applying the original sentence casing.
const text = value => typeof value === 'string' ? value.trim() : ''

function pathName(value) {
  if (typeof value !== 'string') return ''
  const segment = value.split('/').map(part => part.trim())
    .filter(part => part.length > 0 && part !== 'root').at(-1)
  if (!segment) return ''
  const name = segment.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase()
  return name ? name[0].toUpperCase() + name.slice(1) : ''
}

function producerName(agent) {
  // Nicknames are literal producer values. Their spelling is independent of
  // the path formatter and of the interface language.
  const nickname = text(agent?.agentNickname) || text(agent?.displayName)
  if (nickname) return nickname
  for (const value of [agent?.agentPath, agent?.agent_path, agent?.task_name, agent?.taskName]) {
    const name = pathName(value)
    if (name) return name
  }
  return ''
}

export function agentDisplayName(agent, fallback) {
  return producerName(agent) || fallback
}

// One registry belongs to one owning chat/profile/connection scope. Aliases
// only retain actual producer metadata across native/live ID binding.
export function createAgentNameRegistry() {
  const aliases = new Map()
  const identityKeys = agent => [...new Set([agent?.seed, agent?.subagentId, agent?.id].map(text).filter(Boolean))]
  let order = 0
  let metadataOrder = 0
  const owner = entry => {
    if (entry.parent) entry.parent = owner(entry.parent)
    return entry.parent || entry
  }
  const entriesFor = keys => [...new Set(keys.map(id => aliases.get(id)).filter(Boolean).map(owner))]
    .sort((a, b) => a.order - b.order)
  const resolve = (agent, fallback) => {
    const keys = identityKeys(agent)
    const supplied = producerName(agent)
    if (!keys.length) return supplied || fallback
    const existing = entriesFor(keys)
    let entry = existing[0]
    if (entry) {
      const latest = existing.filter(item => item.name).sort((a, b) => b.metadataOrder - a.metadataOrder)[0]
      for (const other of existing.slice(1)) other.parent = entry
      if (latest) {
        entry.name = latest.name
        entry.metadataOrder = latest.metadataOrder
      }
    } else {
      entry = { order: order++, name: '', metadataOrder: 0 }
    }
    if (supplied) {
      entry.name = supplied
      entry.metadataOrder = ++metadataOrder
    }
    for (const id of keys) aliases.set(id, entry)
    return entry.name || fallback
  }
  return resolve
}
