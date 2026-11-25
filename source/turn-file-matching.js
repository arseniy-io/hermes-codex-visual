// Compare only paths whose identity can be established without guessing a
// user's home directory, following links, or comparing filenames alone.
export function turnFileKey(value, cwd = '') {
  if (typeof value !== 'string' || !value || value.includes('\0')) return null
  let path = value
  if (/^file:/i.test(path)) {
    try {
      const url = new URL(path)
      if (url.protocol !== 'file:' || url.search || url.hash || /%2f|%5c/i.test(url.pathname)) return null
      path = decodeURIComponent(url.pathname)
      if (url.hostname) path = `//${url.hostname}${path}`
      else if (/^\/[a-z]:\//i.test(path)) path = path.slice(1)
    } catch {
      return null
    }
  } else if (/^[a-z][a-z\d+.-]*:/i.test(path) && !/^[a-z]:[\\/]/i.test(path)) {
    return null
  }

  const absolute = text => /^(?:[a-z]:[\\/]|\/|\\\\)/i.test(text)
  if (!absolute(path)) {
    if (!cwd || !absolute(cwd) || /^~(?:[\\/]|$)/.test(path)) return null
    path = `${cwd.replace(/[\\/]+$/, '')}/${path}`
  }

  const windows = /^(?:[a-z]:[\\/]|\\\\|\/\/)/i.test(path)
  if (windows) path = path.replaceAll('\\', '/')
  let root = '/'
  if (windows && /^[a-z]:\//i.test(path)) {
    root = path.slice(0, 3)
    path = path.slice(3)
  } else if (windows && path.startsWith('//')) {
    const match = path.match(/^\/\/([^/]+)\/([^/]+)(?:\/|$)/)
    if (!match) return null
    root = `//${match[1]}/${match[2]}/`
    path = path.slice(match[0].length)
  } else {
    path = path.slice(1)
  }
  const parts = []
  for (const part of path.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') {
      if (!parts.length) return null
      parts.pop()
    } else {
      parts.push(part)
    }
  }
  const result = root + parts.join('/')
  return windows ? result.toLowerCase() : result
}
