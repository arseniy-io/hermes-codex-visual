const protectedDescription = /^Write to protected agent-instruction file\(s\): /i
const plurals = new Intl.PluralRules('ru')

// Hermes sends a generic display target, not the proposed edit. Only treat a
// card as a protected-file request when its own description confirms that.
export function protectedApproval(request) {
  if (!request || typeof request.command !== 'string' ||
      typeof request.description !== 'string' || !protectedDescription.test(request.description)) return null
  const match = /^<write to ([\s\S]+)>$/.exec(request.command.trim())
  if (!match || !match[1].trim() || match[1].length > 4096) return null
  return { target: match[1].trim() }
}

// Match the queue's actual request ID, not the displayed basename: several
// approvals for the same filename can be open in the same chat.
export function approvalReview(response, requestId) {
  if (!requestId || !Array.isArray(response?.approvals)) return null
  const matches = response.approvals.filter(item => item?.request_id === requestId)
  if (matches.length !== 1) return null
  const review = matches[0].hcv_review
  if (review?.version !== 1 || review.complete !== true ||
      typeof review.reason !== 'string' || !review.reason.trim() ||
      !Array.isArray(review.files) || !review.files.length || review.files.length > 100) return null
  if (!review.files.every(file => file && typeof file.path === 'string' && file.path &&
      typeof file.diff === 'string' && ['edit', 'create', 'delete'].includes(file.operation))) return null
  return review
}

export function localizedApprovalActivity(value) {
  const match = /^(Ran|Running) (\d{1,8}) commands?$/.exec(value.trim())
  if (!match) return ''
  const count = Number(match[2])
  const form = plurals.select(count)
  const noun = { one: 'команда', few: 'команды', many: 'команд', other: 'команды' }[form]
  const verb = match[1] === 'Running'
    ? (form === 'one' ? 'Выполняется' : 'Выполняются')
    : (form === 'one' ? 'Выполнена' : 'Выполнено')
  return `${verb} ${count} ${noun}`
}
