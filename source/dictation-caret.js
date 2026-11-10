const chip = '[contenteditable="false"]'

function textOf(fragment) {
  for (const node of fragment.querySelectorAll(chip)) node.replaceWith('\uFFFC')
  for (const node of fragment.querySelectorAll('br')) node.replaceWith('\n')
  return fragment.textContent
}

export function draftText(editor) {
  return editor.hasAttribute('data-empty') ? '' : textOf(editor.cloneNode(true))
}

export function draftSelection(editor, range) {
  if (!range) {
    const selection = window.getSelection()
    range = selection?.rangeCount ? selection.getRangeAt(0) : null
  }
  if (!range || !editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return null
  if (editor.hasAttribute('data-empty')) return { start: 0, end: 0 }
  const offset = (node, index) => {
    const prefix = document.createRange()
    prefix.selectNodeContents(editor)
    prefix.setEnd(node, index)
    return textOf(prefix.cloneContents()).length
  }
  return { start: offset(range.startContainer, range.startOffset), end: offset(range.endContainer, range.endOffset) }
}

// Map the original selection through changes made while speaking. The browser's
// edit range disambiguates repeated words when the same prefix could also fit.
export function updateDictationAnchor(anchor, next, edit) {
  const previous = anchor.text
  if (next === previous) return
  const delta = next.length - previous.length
  let start
  let oldEnd
  if (edit && edit.end + delta >= edit.start &&
      previous.slice(0, edit.start) === next.slice(0, edit.start) &&
      previous.slice(edit.end) === next.slice(edit.end + delta)) {
    start = edit.start
    oldEnd = edit.end
  } else {
    start = 0
    oldEnd = previous.length
    let newEnd = next.length
    while (start < oldEnd && start < newEnd && previous[start] === next[start]) start++
    while (oldEnd > start && newEnd > start && previous[oldEnd - 1] === next[newEnd - 1]) {
      oldEnd--
      newEnd--
    }
  }
  const map = offset => offset < start ? offset : Math.max(offset, oldEnd) + delta
  const touchedSelection = anchor.start < anchor.end && (start === oldEnd
    ? anchor.start <= start && start <= anchor.end
    : anchor.start < oldEnd && start < anchor.end)
  anchor.end = map(anchor.end)
  anchor.start = touchedSelection ? anchor.end : map(anchor.start)
  anchor.text = next
}

function pointAt(editor, offset) {
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (node.parentElement?.closest(chip)) return NodeFilter.FILTER_REJECT
      return node.nodeType === Node.TEXT_NODE || node.matches('br, ' + chip) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP
    },
  })
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (offset <= node.length) return [node, offset]
      offset -= node.length
    } else {
      const parent = node.parentNode
      if (offset <= 1) return [parent, [...parent.childNodes].indexOf(node) + offset]
      offset--
    }
  }
  return [editor, editor.childNodes.length]
}

export function insertDictation(editor, anchor, transcript) {
  const { start, end, text } = anchor
  const before = text[start - 1] || ''
  const after = text[end] || ''
  const leftSpace = /[^\s\uFFFC([{«„]/u.test(before) && !/^[,.!?;:…)}\]»”]/u.test(transcript)
  const rightSpace = /[^\s\uFFFC,.!?;:…)}\]»”]/u.test(after)
  const insertion = (leftSpace ? ' ' : '') + transcript + (rightSpace ? ' ' : '')
  editor.focus({ preventScroll: true })
  const selection = window.getSelection()
  if (!selection) return false
  const range = document.createRange()
  range.setStart(...pointAt(editor, start))
  range.setEnd(...pointAt(editor, end))
  selection.removeAllRanges()
  selection.addRange(range)
  // The native input handler receives the edit and persists the composer draft.
  return document.execCommand('insertText', false, insertion)
}
