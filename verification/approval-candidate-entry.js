// The installed module is copied here before building, so unfinished source
// changes from other tasks cannot silently enter this isolated candidate.
import base from '../.local/approval-installed-base.js'
import { registerChatApproval } from '../source/chat-approval.js'
import { registerStyleScope } from '../source/style-scope.js'

export default {
  ...base,
  register(ctx) {
    base.register(ctx)
    // The prebuilt module has its own bundled style registry. The isolated
    // overlay needs a separate registry; the real source build shares one.
    registerStyleScope(ctx, 'codex-workspace')
    registerChatApproval(ctx, ':root[data-hermes-codex-visual][data-hermes-theme="codex-workspace"]')
  },
}
