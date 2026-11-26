// Observe native text fields that affect presentation. The broader structural
// observers discover replacements without reading ordinary streaming prose.
export function observeChatText(onChange) {
  const observer = new MutationObserver(onChange)
  const owners = new Map()
  const options = { subtree: true, characterData: true }
  let rebuild = false

  function set(owner, first = null, second = null) {
    const previous = owners.get(owner)
    if (previous ? previous[0] === first && previous[1] === second : !first && !second) return
    if (previous) rebuild ||= Boolean(previous[0] && previous[0] !== first || previous[1] && previous[1] !== second)
    if (!first && !second) owners.delete(owner)
    else owners.set(owner, [first, second])
    if (rebuild) return
    if (first && first !== previous?.[0]) observer.observe(first, options)
    if (second && second !== previous?.[1]) observer.observe(second, options)
  }

  function refresh() {
    if (!rebuild) return
    // Disconnect removes every subscription, including ones just awaiting
    // delivery. Keep any records from a native update during this pass.
    const records = observer.takeRecords()
    observer.disconnect()
    for (const targets of owners.values()) {
      for (const target of targets) if (target) observer.observe(target, options)
    }
    rebuild = false
    if (records.length) onChange(records)
  }

  function clear() {
    observer.disconnect()
    owners.clear()
    rebuild = false
  }

  return { set, refresh, clear }
}
