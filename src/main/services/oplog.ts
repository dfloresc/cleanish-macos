import { appendFile, readFile, mkdir } from 'fs/promises'
import { app } from 'electron'
import path from 'node:path'
import type { OpLogEntry } from '../../shared/types'

function logFile(): string {
  return path.join(app.getPath('userData'), 'oplog.jsonl')
}

export async function appendOpLog(entry: OpLogEntry): Promise<void> {
  try {
    await mkdir(path.dirname(logFile()), { recursive: true })
    await appendFile(logFile(), JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    /* logging must never break cleaning */
  }
}

export async function readOpLog(limit = 100): Promise<OpLogEntry[]> {
  try {
    const raw = await readFile(logFile(), 'utf8')
    const entries: OpLogEntry[] = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      try {
        entries.push(JSON.parse(line) as OpLogEntry)
      } catch {
        /* skip corrupt line */
      }
    }
    return entries.reverse().slice(0, limit)
  } catch {
    return []
  }
}
