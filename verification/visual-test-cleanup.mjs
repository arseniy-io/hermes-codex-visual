/** Capture a directory's own filesystem identity, refusing reparse points and
 * platforms where the volume, file ID or creation time cannot be obtained. */
export function captureDirectoryIdentity(fs, root) {
  const pathInfo = fs.lstatSync(root, { bigint: true })
  if (!pathInfo.isDirectory() || pathInfo.isSymbolicLink()) throw new Error('Isolated profile is not a plain directory')
  // Use bigint so Windows NTFS file IDs are not rounded by Number.
  const info = fs.statSync(root, { bigint: true })
  if (!info.isDirectory()) throw new Error('Isolated profile is not a directory')
  if (typeof info.dev !== 'bigint' || info.dev <= 0n
      || typeof info.ino !== 'bigint' || info.ino <= 0n
      || typeof info.birthtimeNs !== 'bigint' || info.birthtimeNs <= 0n) {
    throw new Error('Isolated profile directory identity is unavailable')
  }
  if (pathInfo.dev !== info.dev || pathInfo.ino !== info.ino || pathInfo.birthtimeNs !== info.birthtimeNs) {
    throw new Error('Isolated profile directory identity changed while inspecting')
  }
  return { dev: info.dev, ino: info.ino, birthtimeNs: info.birthtimeNs }
}

/**
 * Close one isolated visual test. A failed/unknown cleanup is a test failure;
 * keep its temporary profile for diagnosis instead of deleting it.
 * The supplied stopGateway must itself restrict its action to the test home.
 */
export async function cleanupVisualTest({
  sandboxRoot,
  releases,
  closeApp,
  closeRemoteGateway,
  stopGateway,
  closeMock,
  closeMcp,
  removeSandbox,
  electronLaunchAttempted,
  hasElectronHandle,
  hasMainError = false,
  mainError,
}) {
  const failures = []
  const attempt = async (name, operation) => {
    try {
      await operation()
      return true
    } catch (error) {
      failures.push(new Error(`${name} failed`, { cause: error }))
      return false
    }
  }

  // Try each release independently, even when a preceding release failed.
  for (const [name, release] of releases) await attempt(name, release)
  let desktopStopped = true
  if (hasElectronHandle) {
    desktopStopped = await attempt('Close isolated Electron', closeApp)
  } else if (electronLaunchAttempted) {
    desktopStopped = false
    failures.push(new Error('Isolated Electron launch outcome is unknown'))
  }
  await attempt('Close isolated remote gateway', closeRemoteGateway)
  if (desktopStopped) await attempt('Stop isolated gateway', stopGateway)
  else failures.push(new Error('Local gateway cleanup skipped while Electron status is unknown'))
  await attempt('Close mock server', closeMock)
  await attempt('Close MCP server', closeMcp)

  let removalAttempted = false
  if (failures.length === 0) {
    removalAttempted = true
    await attempt('Remove isolated test profile', removeSandbox)
  }
  if (failures.length) {
    const errors = hasMainError ? [mainError, ...failures] : failures
    const initial = hasMainError ? ` Original test error: ${String(mainError?.message ?? mainError)}.` : ''
    const details = failures.map(error => `${error.message}: ${String(error.cause?.message ?? error.cause ?? 'unknown')}`).join('; ')
    throw new AggregateError(errors,
      `Isolated test cleanup incomplete; ${removalAttempted ? 'profile may be partially removed' : 'profile retained for investigation'}: ${sandboxRoot}.${initial} Cleanup: ${details}`,
      hasMainError ? { cause: mainError } : undefined)
  }
}
