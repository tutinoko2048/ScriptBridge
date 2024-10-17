const _intervals = new Map<number, NodeJS.Timeout>();
const _timeouts = new Map<number, NodeJS.Timeout>();
let _runId = 0;


export class System {
  runInterval(callback: () => void, intervalTicks: number): number {
    _intervals.set(_runId, setInterval(callback, intervalTicks * 50));
    return _runId++;
  }

  runTimeout(callback: () => void, timeoutTicks: number): number {
    _timeouts.set(_runId, setTimeout(callback, timeoutTicks * 50));
    return _runId++;
  }

  clearRun(id: number): void {
    if (_intervals.has(id)) {
      clearInterval(_intervals.get(id)!);
      _intervals.delete(id);
    } else if (_timeouts.has(id)) {
      clearTimeout(_timeouts.get(id)!);
      _timeouts.delete(id);
    }
  }
}

export const system = new System();

export type RawMessage = any;
