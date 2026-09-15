import assert from 'node:assert/strict'
import { test, beforeEach } from 'node:test'
import { mkdir, writeFile, readFile, readdir, lstat, rm, symlink, rename } from 'node:fs/promises'
import path from 'node:path'
import { HOME, TRASH, assertDeletable, isProtectedBundleId } from '../src/main/services/safety'
import { listFolder, measureFolder } from '../src/main/services/explorer'
import { scanLargeFiles } from '../src/main/services/large-files'
import { pathSize, mapLimit } from '../src/main/services/size'
import { previewClean, executeClean } from '../src/main/services/cleaner'
import { invalidateCaches } from '../src/main/services/cache'
import { beginScan, abortCurrentScan, finishScan, ScanAbortedError } from '../src/main/services/scan-control'
import { scanApplications } from '../src/main/services/scanner'
import { analyzeApps } from '../src/main/services/analyzer'
import { scanSystemJunk } from '../src/main/services/system-junk'
import { scanLeftovers } from '../src/main/services/leftovers'
import { saveSettings, loadSettings } from '../src/main/services/settings'

const fixture = (p: string): string => path.join(HOME, p)
const reads = (): string[] => (globalThis as unknown as { __reads: string[] }).__reads ?? []
const opts = { allowPermanent: false, permanent: false, label: 'test', action: 'trash' as const }
async function file(p: string, content = 'fixture'): Promise<string> {
  const full = fixture(p)
  await mkdir(path.dirname(full), { recursive: true })
  await writeFile(full, content)
  return full
}
async function bundle(name: string, id: string): Promise<string> {
  await file(`Applications/${name}.app/Contents/Info.plist`, `<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${id}</string><key>CFBundleName</key><string>${name.split('/').pop()}</string></dict></plist>`)
  return fixture(`Applications/${name}.app`)
}

beforeEach(async () => {
  invalidateCaches()
  for (const entry of await readdir(HOME)) {
    if (entry === 'tests.cjs') continue
    await rm(fixture(entry), { recursive: true, force: true })
  }
  ;(globalThis as unknown as { __reads: string[] }).__reads = []
})

test('blocks macOS components, Library parents, secrets and protected bundles', async () => {
  const paths = ['Library', 'Library/Application Support', 'Library/Containers', 'Library/Keychains',
    'Library/Preferences/com.apple.finder.plist', 'Library/Caches/com.apple.Safari', 'Library/Group Containers/group.com.apple.notes',
    'Library/Application Support/CloudDocs', '.ssh/id_ed25519', 'Library/Developer/Xcode/Archives/archive', 'Library/pnpm/bin/tool']
  for (const p of paths) {
    await file(p + '/fixture')
    assert.equal((await assertDeletable(fixture(p))).ok, false, p)
  }
  for (const p of ['/', HOME, '/Applications', '/System/Applications/Safari.app', '/usr/local/bin/a', '', 'relative', '/bad\0path']) {
    assert.equal((await assertDeletable(p)).ok, false, p)
  }
  assert.equal(isProtectedBundleId('COM.APPLE.Safari'), true)
  const apple = await bundle('AppleApp', 'com.apple.Test')
  assert.equal((await assertDeletable(apple)).ok, false)
  const thirdParty = await bundle('Utilities/Test', 'org.vendor.Test')
  assert.equal((await assertDeletable(thirdParty)).ok, true)
  assert.equal((await assertDeletable(path.join(thirdParty, 'Contents/Info.plist'))).ok, false)
})

test('ordinary folders, dotfiles and third-party application data can be explicitly cleaned', async () => {
  for (const p of ['projects/my-project', 'Downloads/extracted', 'Library/Application Support/Tool', 'Library/Containers/org.vendor.Tool', 'Library/Group Containers/TEAM.org.vendor.Tool', 'Library/HTTPStorages/org.vendor.Tool', 'Library/WebKit/org.vendor.Tool']) {
    await file(p + '/data', 'data')
    assert.equal((await assertDeletable(fixture(p))).ok, true, p)
    const preview = await previewClean([{ path: fixture(p) }])
    assert.equal(preview.targets.length, 1, p)
    assert.equal(preview.totalSize, 4)
  }
  const hidden = await file('Downloads/.download-metadata')
  assert.equal((await assertDeletable(hidden)).ok, true)
})

test('optional Apple apps and apps with nonstandard metadata are uninstallable', async () => {
  for (const [name, id] of [['Xcode', 'com.apple.dt.Xcode'], ['Pages', 'com.apple.iWork.Pages'], ['Numbers', 'com.apple.iWork.Numbers'], ['Keynote', 'com.apple.iWork.Keynote'], ['NoIdentifier', '']]) {
    const p = await bundle(name, id)
    assert.equal((await assertDeletable(p)).ok, true, name)
    assert.equal((await previewClean([{ path: p }])).targets.length, 1, name)
  }
  await file('Applications/Nonstandard.app/Contents/Info.plist', '<plist><dict><key>CFBundleName</key><string>Nonstandard</string></dict></plist>')
  const apps = await scanApplications(undefined, undefined, true)
  assert.equal(apps.length, 6)
  assert.ok(apps.every((app) => !app.isSystem && !app.uninstallBlockedReason))
})

test('allows selected regular user files and regenerable artifacts; rejects symlinks and linked ancestors', async () => {
  const safe = await file('Downloads/document.zip')
  assert.equal((await assertDeletable(safe)).ok, true)
  const cache = await file('Library/Caches/org.test/file')
  assert.equal((await assertDeletable(path.dirname(cache))).ok, true)
  await symlink(safe, fixture('Downloads/link'))
  assert.equal((await assertDeletable(fixture('Downloads/link'))).ok, false)
  await symlink(fixture('Downloads'), fixture('Library/Caches/linked'))
  assert.equal((await assertDeletable(fixture('Library/Caches/linked/document.zip'))).ok, false)
  await assert.rejects(listFolder(fixture('Library/Caches/linked')), /linked/)
})

test('listing is shallow, reuses cache and rolls up only visited descendants', async () => {
  await file('Downloads/direct', '12345')
  await file('Downloads/child/nested', '123456789')
  await file('Downloads/child/deeper/file', 'abc')
  let listing = await listFolder(fixture('Downloads'))
  assert.equal(listing.size, 5)
  assert.equal(listing.sizeState, 'partial')
  assert.equal(listing.entries.find((e) => e.name === 'child')?.sizeState, 'unknown')
  assert.deepEqual(reads(), [fixture('Downloads')])
  await listFolder(fixture('Downloads'))
  assert.equal(reads().length, 1)
  await listFolder(fixture('Downloads/child'))
  listing = await listFolder(fixture('Downloads'))
  assert.equal(listing.size, 14)
  assert.equal(listing.sizeState, 'partial')
  await listFolder(fixture('Downloads/child/deeper'))
  listing = await listFolder(fixture('Downloads'))
  assert.equal(listing.size, 17)
  assert.equal(listing.sizeState, 'complete')
})

test('Explorer automatically completes folder sizes, reports progress and reuses descendant totals', async () => {
  await file('Downloads/direct', '12345')
  await file('Downloads/child/nested', '123456789')
  await file('Downloads/child/deeper/file', 'abc')
  await file('Documents/unrelated/file', 'untouched')
  const updates: Array<{ size: number; complete: boolean }> = []
  const listing = await measureFolder(fixture('Downloads'), (partial) => updates.push({ size: partial.size, complete: partial.sizeState === 'complete' }))
  assert.equal(listing.size, 17)
  assert.equal(listing.sizeState, 'complete')
  assert.equal(listing.entries.find((e) => e.name === 'child')?.size, 12)
  assert.deepEqual(updates[0], { size: 5, complete: false })
  assert.deepEqual(updates.at(-1), { size: 17, complete: true })
  assert.ok(reads().every((p) => p.startsWith(fixture('Downloads'))))
  const count = reads().length
  await measureFolder(fixture('Downloads'))
  assert.equal(reads().length, count)
  const child = await measureFolder(fixture('Downloads/child'))
  assert.equal(child.size, 12)
  // Listing a newly opened child is shallow; measuring its deeper rows uses cache.
  assert.deepEqual(reads().slice(count), [fixture('Downloads/child')])
})

test('Explorer cancellation stops before measuring descendants and cannot publish a final result', async () => {
  await file('Downloads/child/nested', 'data')
  let aborted = false
  await assert.rejects(measureFolder(fixture('Downloads'), () => { aborted = true }, () => aborted), ScanAbortedError)
  assert.deepEqual(reads(), [fixture('Downloads')])
})

test('refresh and deletion invalidate measured directory totals including cached ancestors', async () => {
  const nested = await file('Downloads/child/deep/file', '123')
  await file('Documents/cached/file', 'abc')
  await measureFolder(fixture('Downloads'))
  await measureFolder(fixture('Documents'))
  await writeFile(nested, '1234567')
  assert.equal((await measureFolder(fixture('Downloads'))).size, 3)
  invalidateCaches([fixture('Downloads')])
  assert.equal((await measureFolder(fixture('Downloads'))).size, 7)
  const count = reads().length
  await measureFolder(fixture('Documents'))
  assert.equal(reads().length, count)
  const preview = await previewClean([{ path: nested }])
  assert.equal((await executeClean(preview.id, opts)).succeeded.length, 1)
  assert.equal((await measureFolder(fixture('Downloads'))).size, 0)
})

test('home and large-file views never recursively scan the home directory', async () => {
  await file('Downloads/direct', '12345')
  await file('Downloads/child/huge', 'x'.repeat(10000))
  await listFolder(HOME)
  assert.deepEqual(reads(), [HOME])
  const files = await scanLargeFiles(1, undefined, undefined, fixture('Downloads'))
  assert.deepEqual(files.map((f) => f.path), [fixture('Downloads/direct')])
  assert.equal(reads().includes(fixture('Downloads/child')), false)
})

test('protected files remain visible with sizes, unreadable folders fail instead of looking empty', async () => {
  await file('Library/Keychains/keys', 'private')
  const result = await listFolder(fixture('Library/Keychains'))
  assert.equal(result.entries[0].protected, true)
  assert.equal(result.entries[0].size, 7)
  await mkdir(fixture('Unreadable'))
  await assert.rejects(listFolder(fixture('Unreadable')), /no access/)
})

test('manual refresh invalidates the changed subtree and ancestors, preserving unrelated cache', async () => {
  const a = await file('Downloads/a', '123')
  await file('Documents/b', 'abc')
  await listFolder(fixture('Downloads'))
  await listFolder(fixture('Documents'))
  await writeFile(a, '123456')
  assert.equal((await listFolder(fixture('Downloads'))).size, 3)
  invalidateCaches([fixture('Downloads')])
  assert.equal((await listFolder(fixture('Downloads'))).size, 6)
  const count = reads().length
  await listFolder(fixture('Documents'))
  assert.equal(reads().length, count)
})

test('size calculation is bounded, cancellable, cached and does not follow links', async () => {
  await file('Downloads/tree/file', '12345')
  await file('Documents/secret', 'x'.repeat(100))
  await symlink(fixture('Documents'), fixture('Downloads/tree/link'))
  const result = await pathSize(fixture('Downloads/tree'))
  assert.equal(result.size, 5)
  assert.equal(result.files, 1)
  const count = reads().length
  await pathSize(fixture('Downloads/tree'))
  assert.equal(reads().length, count)
  invalidateCaches()
  await assert.rejects(pathSize(fixture('Downloads/tree'), () => true), ScanAbortedError)
  let active = 0, maximum = 0
  await mapLimit(Array.from({ length: 100 }), async () => { maximum = Math.max(maximum, ++active); await new Promise((r) => setTimeout(r, 1)); active-- })
  assert.equal(maximum, 8)
})

test('duplicate and overlapping targets are counted once; caller-supplied sizes are ignored', async () => {
  const p = await file('Library/Caches/org.test/file', '1234')
  const result = await previewClean([{ path: p, size: 9999 }, { path: path.dirname(p) }, { path: p }])
  assert.equal(result.targets.length, 1)
  assert.equal(result.totalSize, 4)
})

test('trash execution deletes only reviewed items, not items added after preview', async () => {
  const old = await file('.Trash/reviewed', 'old')
  const preview = await previewClean([{ path: TRASH }], { allowPermanent: true })
  const added = await file('.Trash/new', 'new')
  assert.deepEqual(preview.targets.map((t) => t.path), [old])
  assert.deepEqual(preview.warnings, ['trashPermanent'])
  const result = await executeClean(preview.id, { ...opts, allowPermanent: true })
  assert.equal(result.succeeded.length, 1)
  assert.equal(result.freedBytes, 3)
  await assert.rejects(lstat(old))
  assert.equal(await readFile(added, 'utf8'), 'new')
  await assert.rejects(executeClean(preview.id, opts), /preview expired/)
})

test('moving to trash invalidates sizes and never reports disk space freed', async () => {
  const p = await file('Downloads/archive', '123456')
  await listFolder(fixture('Downloads'))
  const preview = await previewClean([{ path: p }])
  const result = await executeClean(preview.id, opts)
  assert.equal(result.trashedBytes, 6)
  assert.equal(result.freedBytes, 0)
  assert.equal((await listFolder(fixture('Downloads'))).size, 0)
  assert.equal(await readFile(fixture('.Trash/archive'), 'utf8'), '123456')
})

test('rejects replaced files and symlink swaps between preview and execution', async () => {
  const p = await file('Downloads/document', 'initial')
  const preview = await previewClean([{ path: p }])
  await rename(p, p + '.original')
  await file('Downloads/document', 'new data')
  const result = await executeClean(preview.id, opts)
  assert.equal(result.succeeded.length, 0)
  assert.equal(result.failed.length, 1)
  assert.equal(await readFile(p, 'utf8'), 'new data')
  const second = await previewClean([{ path: p }])
  await rm(p)
  await symlink(p + '.original', p)
  assert.equal((await executeClean(second.id, opts)).succeeded.length, 0)
  assert.equal(await readFile(p + '.original', 'utf8'), 'initial')
})

test('execute cannot upgrade a trash preview to permanent deletion', async () => {
  const p = await file('Downloads/file', 'data')
  const preview = await previewClean([{ path: p }])
  const result = await executeClean(preview.id, { ...opts, permanent: true })
  assert.equal(result.succeeded[0].method, 'trash')
  const second = await previewClean([{ path: fixture('.Trash/file') }], { allowPermanent: true })
  assert.equal(second.targets[0].method, 'permanent')
})

test('nothing is deleted permanently while the setting is disabled, including items already in the Trash', async () => {
  const trashed = await file('.Trash/old', 'old')
  const whole = await previewClean([{ path: TRASH }])
  assert.equal(whole.targets.length, 0)
  assert.deepEqual(whole.blocked, [{ path: TRASH, reason: 'permanent deletion disabled' }])
  assert.deepEqual(whole.warnings, ['trashNeedsPermanent'])
  const single = await previewClean([{ path: trashed }], { permanent: true })
  assert.deepEqual(single.blocked.map((b) => b.reason), ['permanent deletion disabled'])
  const regular = await file('Downloads/report', 'data')
  assert.equal((await previewClean([{ path: regular }], { permanent: true })).targets[0].method, 'trash')

  // A preview approved while the setting was enabled cannot run after it is turned off.
  const approved = await previewClean([{ path: regular }, { path: trashed }], { permanent: true, allowPermanent: true })
  assert.deepEqual(approved.targets.map((t) => t.method), ['permanent', 'permanent'])
  const result = await executeClean(approved.id, { ...opts, permanent: true })
  assert.equal(result.succeeded.length, 0)
  assert.deepEqual(result.failed.map((f) => f.reason), ['permanent deletion disabled', 'permanent deletion disabled'])
  assert.equal(await readFile(regular, 'utf8'), 'data')
  assert.equal(await readFile(trashed, 'utf8'), 'old')
})

test('scan ownership prevents late cancellation from aborting the next scan or another window', () => {
  const old = beginScan(1, 'old')
  const next = beginScan(1, 'next')
  const other = beginScan(2, 'other')
  assert.equal(old.aborted, true)
  abortCurrentScan(1, 'old')
  assert.equal(next.aborted, false)
  finishScan(1, old)
  abortCurrentScan(1, 'next')
  assert.equal(next.aborted, true)
  assert.equal(other.aborted, false)
  finishScan(2, other)
})

test('app discovery finds Utilities, avoids duplicate bundle IDs as row IDs, and skips icon/size work for leftovers', async () => {
  await bundle('Utilities/Tool', 'org.vendor.Tool')
  await bundle('OtherTool', 'org.vendor.Tool')
  const apps = await scanApplications(undefined, undefined, true)
  assert.equal(apps.length, 2)
  assert.equal(new Set(apps.map((a) => a.id)).size, 2)
  assert.ok(apps.every((a) => a.appSize === 0 && a.icon === null))
  assert.equal(reads().some((p) => p.endsWith('.app')), false)
})

test('app data and preferences are not junk; running apps have no quick-clean artifacts', async () => {
  await bundle('Tool', 'org.vendor.Tool')
  await file('Library/Caches/org.vendor.Tool/cache', '12')
  await file('Library/Preferences/org.vendor.Tool.plist', '123')
  await file('Library/Application Support/Tool/database', '12345')
  const apps = await scanApplications(undefined, undefined, true)
  let [analysis] = await analyzeApps(apps)
  assert.equal(analysis.totalJunkSize, 2)
  assert.equal(analysis.totalDataSize, 10)
  assert.equal(analysis.artifacts.find((a) => a.category === 'appSupport')?.protected, false)
  assert.equal(analysis.artifacts.find((a) => a.category === 'appSupport')?.cleanable, false)
  apps[0].isRunning = true
  ;[analysis] = await analyzeApps(apps)
  assert.equal(analysis.totalJunkSize, 0)
})

test('junk excludes archives, pnpm installations, local Maven artifacts and protected Apple paths', async () => {
  await file('Library/Caches/org.vendor.Tool/cache', '12')
  await file('Library/Caches/com.apple.test/cache', '123')
  await file('Library/Developer/Xcode/Archives/archive', '123')
  await file('Library/Developer/Xcode/DerivedData/build/result', '123')
  await file('Library/pnpm/bin/tool', '123')
  await file('.m2/repository/local.jar', '123')
  await file('.npm/_cacache/content/entry', '123')
  const groups = await scanSystemJunk(true)
  assert.ok(groups.some((g) => g.id === 'dev-npm'))
  assert.ok(groups.some((g) => g.id === 'dev-xcode'))
  assert.ok(groups.every((g) => g.paths.every((p) => !/Archives|pnpm|\.m2|com\.apple/.test(p))))
  const leftovers = await scanLeftovers([])
  assert.equal(leftovers.some((g) => g.paths.some((p) => p.includes('com.apple'))), false)
})

test('settings writes merge in order, clamp values and do not trust invalid persisted permissions', async () => {
  await Promise.all([saveSettings({ language: 'es' }), saveSettings({ largeFileThresholdMB: 750 }), saveSettings({ allowPermanentDelete: true })])
  assert.deepEqual(await loadSettings(), { language: 'es', largeFileThresholdMB: 750, allowPermanentDelete: true })
  await file('settings/settings.json', JSON.stringify({ allowPermanentDelete: 'true', language: 'xx', largeFileThresholdMB: -50 }))
  assert.deepEqual(await loadSettings(), { language: 'system', allowPermanentDelete: false, largeFileThresholdMB: 50 })
})


test('rejects changed nested content even when the selected directory itself is unchanged', async () => {
  const nested = await file('Library/Caches/org.test/deep/entry', 'original')
  const dir = fixture('Library/Caches/org.test')
  const preview = await previewClean([{ path: dir }])
  const parentStamp = (await lstat(dir)).mtimeMs
  await writeFile(nested, 'changed data')
  assert.equal((await lstat(dir)).mtimeMs, parentStamp)
  const result = await executeClean(preview.id, opts)
  assert.equal(result.succeeded.length, 0)
  assert.equal(result.failed.length, 1)
  assert.equal(await readFile(nested, 'utf8'), 'changed data')
})

test('parent cleanup cannot bypass protected descendants', async () => {
  await file('Downloads/backup/passwords.keychain-db', 'important')
  const preview = await previewClean([{ path: fixture('Downloads/backup') }])
  assert.equal(preview.targets.length, 0)
  assert.match(preview.blocked[0].reason, /protected/)
})

test('app containers with Apple preference filenames and internal links remain cleanable without following links', async () => {
  const root = 'Library/Containers/org.vendor.Tool'
  await file(root + '/Data/Library/Preferences/com.apple.security.plist', '123')
  const outside = await file('Documents/keep', 'keep')
  await symlink(fixture('Documents'), fixture(root + '/Data/Documents'))
  const preview = await previewClean([{ path: fixture(root) }])
  assert.equal(preview.targets.length, 1)
  assert.equal(preview.totalSize, 3)
  assert.equal((await executeClean(preview.id, opts)).succeeded.length, 1)
  assert.equal(await readFile(outside, 'utf8'), 'keep')
})

test('possible third-party leftovers are selectable, while system data stays protected', async () => {
  await file('Library/Application Support/OldTool/data', '123')
  await file('Library/Containers/org.old.Tool/data', '123')
  await file('Library/Preferences/org.old.Tool.plist', '123')
  await file('Library/Application Support/CloudDocs/keep', '123')
  const groups = await scanLeftovers([])
  for (const p of ['OldTool', 'org.old.Tool']) assert.ok(groups.some((g) => !g.protected && g.paths.some((s) => s.includes(p))), p)
  assert.ok(groups.filter((g) => g.paths.some((p) => p.includes('CloudDocs'))).every((g) => g.protected))
})

test('system junk leaves caches and logs of running apps alone and says so', async () => {
  await file('Library/Caches/org.vendor.Tool/cache', '12')
  await file('Library/Caches/org.vendor.Tool.helper/cache', '12')
  await file('Library/Caches/org.other.Idle/cache', '123')
  await file('Library/Logs/Tool/log.txt', '1')
  await file('Library/Logs/Idle/log.txt', '1')
  const running = { paths: new Set<string>(), bundleIds: new Set(['org.vendor.tool']), names: new Set(['tool']) }
  const groups = await scanSystemJunk(false, undefined, undefined, running)
  const caches = groups.find((g) => g.id === 'caches')
  const logs = groups.find((g) => g.id === 'logs')
  assert.deepEqual(caches?.paths, [fixture('Library/Caches/org.other.Idle')])
  assert.equal(caches?.note, 'runningNote')
  assert.deepEqual(logs?.paths, [fixture('Library/Logs/Idle')])
  const idle = await scanSystemJunk(false, undefined, undefined, { paths: new Set(), bundleIds: new Set(), names: new Set() })
  assert.equal(idle.find((g) => g.id === 'caches')?.paths.length, 3)
  assert.equal(idle.find((g) => g.id === 'caches')?.note, undefined)
})

test('vendor folders, team group containers, Apple names and device backups are not selectable leftovers', async () => {
  await bundle('Microsoft Word', 'com.microsoft.Word')
  await bundle('Google Chrome', 'com.google.Chrome')
  await file('Library/Application Support/Microsoft/Office/data', '1')
  await file('Library/Application Support/Google/Chrome/Default/History', '1')
  await file('Library/Group Containers/UBF8T346G9.Office/outlook', '1')
  await file('Library/Group Containers/UBF8T346G9.com.microsoft.oneauth/token', '1')
  await file('Library/Group Containers/group.org.old.Tool/data', '1')
  await file('Library/Application Support/com.apple.sharedfilelist/list', '1')
  await file('Library/Application Support/MobileSync/Backup/device', '1')
  await file('Library/Application Support/OldTool/data', '1')
  const apps = await scanApplications(undefined, undefined, true)
  const groups = await scanLeftovers(apps)
  const paths = groups.flatMap((g) => g.paths)
  for (const excluded of ['Microsoft', 'Google', 'UBF8T346G9.Office', 'oneauth', 'com.apple.sharedfilelist']) {
    assert.equal(paths.some((p) => p.includes(excluded)), false, excluded)
  }
  assert.ok(groups.some((g) => !g.protected && g.bundleId === 'org.old.Tool'))
  assert.ok(groups.some((g) => !g.protected && g.name === 'OldTool'))
  assert.ok(groups.filter((g) => g.paths.some((p) => p.includes('MobileSync'))).every((g) => g.protected))
})

test('files inside media libraries are protected, while the library or its parent can be trashed as a whole', async () => {
  const original = await file('Pictures/Photos Library.photoslibrary/originals/A/img.heic', 'photo')
  assert.equal((await assertDeletable(original)).ok, false)
  assert.equal((await assertDeletable(fixture('Pictures/Photos Library.photoslibrary'))).ok, true)
  await file('Pictures/Old/Trip.photoslibrary/originals/B/img.heic', 'photo')
  const preview = await previewClean([{ path: fixture('Pictures/Old') }])
  assert.equal(preview.targets.length, 1)
  assert.equal(preview.totalSize, 5)
})

test('recursive large-file scan walks subfolders, skips packages and links, and flags protected files', async () => {
  const big = 'x'.repeat(2048)
  await file('Downloads/root.bin', big)
  await file('Downloads/nested/deep/inner.bin', big)
  await file('Downloads/nested/small.bin', 'tiny')
  await file('Downloads/Tool.app/Contents/Resources/asset.bin', big)
  await file('Downloads/Lib.photoslibrary/originals/img.bin', big)
  await file('Downloads/backup/secret.keychain-db', big)
  await file('Documents/elsewhere.bin', big)
  await symlink(fixture('Documents'), fixture('Downloads/link'))
  const seen: string[] = []
  const files = await scanLargeFiles(1024, (current) => seen.push(current), undefined, fixture('Downloads'), true)
  assert.deepEqual(files.map((f) => path.relative(fixture('Downloads'), f.path)).sort(), ['backup/secret.keychain-db', 'nested/deep/inner.bin', 'root.bin'])
  assert.equal(files.find((f) => f.path.endsWith('secret.keychain-db'))?.protected, true)
  assert.equal(files.find((f) => f.path.endsWith('root.bin'))?.protected, false)
  assert.ok(seen.length >= 1)
  const shallow = await scanLargeFiles(1024, undefined, undefined, fixture('Downloads'))
  assert.deepEqual(shallow.map((f) => path.basename(f.path)), ['root.bin'])
  const controller = beginScan(1, 'cancelled')
  controller.aborted = true
  await assert.rejects(scanLargeFiles(1024, undefined, () => controller.aborted, fixture('Downloads'), true), ScanAbortedError)
  finishScan(1, controller)
})
