export class ScanAbortedError extends Error {
  constructor() { super('scan aborted'); this.name = 'ScanAbortedError' }
}
export interface ScanController { aborted: boolean; requestId: string }
export type IsAborted = () => boolean
const current = new Map<number, ScanController>()

export function beginScan(owner: number, requestId: string): ScanController {
  const previous = current.get(owner)
  if (previous) previous.aborted = true
  const controller = { aborted: false, requestId }
  current.set(owner, controller)
  return controller
}
export function finishScan(owner: number, controller: ScanController): void {
  if (current.get(owner) === controller) current.delete(owner)
}
export function abortCurrentScan(owner: number, requestId: string): void {
  const controller = current.get(owner)
  if (controller?.requestId === requestId) controller.aborted = true
}
export function checkAborted(isAborted: IsAborted | undefined): void {
  if (isAborted?.()) throw new ScanAbortedError()
}
