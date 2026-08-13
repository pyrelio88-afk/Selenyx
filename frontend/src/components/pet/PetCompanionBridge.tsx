/**
 * One small bridge for all companion surfaces.
 *
 * It polls the two independent local summaries in parallel, tells the native
 * window about terminal runs/evidence, and renders the same state in the web
 * fallback. Keeping this here avoids three views each adding their own timer
 * or Tauri listener.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAppStore } from '@stores/appStore';
import { agentApi, type AgentRunSummary } from '@services/agent';
import { evidenceApi } from '@services/api';
import {
  emitPetCelebrate,
  emitPetState,
  isDesktopTauri,
  listenForPetEvent,
  requestPetSummary,
  type PetRuntimeState,
} from '@services/nativeRuntime';
import { FloatingCrane } from '@components/pet/FloatingCrane';

export interface PetNotice {
  runId: string;
  status: 'completed' | 'failed';
  message: string;
}

export interface PetCompanionSnapshot extends PetRuntimeState {
  notice: PetNotice | null;
  summaryText: string;
}

const EMPTY_SNAPSHOT: PetCompanionSnapshot = {
  pendingCount: 0,
  completedToday: 0,
  failedToday: 0,
  runningToday: 0,
  notice: null,
  summaryText: '今日尚无任务运行',
};

function isToday(value: string | null, today: Date): boolean {
  if (!value) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime())
    && date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
}

export function petSummaryText(state: Pick<PetRuntimeState, 'completedToday' | 'failedToday' | 'runningToday' | 'pendingCount'>): string {
  const parts = [`今日完成 ${state.completedToday} 项`];
  if (state.failedToday) parts.push(`失败 ${state.failedToday} 项`);
  if (state.runningToday) parts.push(`进行中 ${state.runningToday} 项`);
  if (state.pendingCount) parts.push(`待裁决证据 ${state.pendingCount} 条`);
  return parts.join(' · ');
}

export function summarizePetRuns(runs: AgentRunSummary[], pendingCount: number, today = new Date()): PetRuntimeState {
  let completedToday = 0;
  let failedToday = 0;
  let runningToday = 0;
  for (const run of runs) {
    if (!isToday(run.startedAt, today)) continue;
    if (run.status === 'completed') completedToday += 1;
    else if (run.status === 'failed') failedToday += 1;
    else if (run.status === 'running' || run.status === 'cancelling' || run.status === 'waiting_confirm') runningToday += 1;
  }
  return { pendingCount, completedToday, failedToday, runningToday };
}

function isNotifiableTerminal(status: string): status is 'completed' | 'failed' {
  return status === 'completed' || status === 'failed';
}

function runNotice(run: AgentRunSummary): PetNotice | null {
  if (!isNotifiableTerminal(run.status)) return null;
  const goal = run.goal.replace(/^\[自动化\s*·[^\]]*\]\s*/, '').replace(/\s+/g, ' ').trim();
  const shortGoal = goal.length > 28 ? `${goal.slice(0, 28)}…` : goal;
  return {
    runId: run.id,
    status: run.status,
    message: run.status === 'completed'
      ? `已完成：${shortGoal || '研究任务'}`
      : `执行失败：${shortGoal || '研究任务'}，可在任务页查看。`,
  };
}

export function PetCompanionBridge({ nativeActive }: { nativeActive: boolean }) {
  const enabled = useAppStore((state) => state.petEnabled);
  const setPetEnabled = useAppStore((state) => state.setPetEnabled);
  const setView = useAppStore((state) => state.setView);
  const [snapshot, setSnapshot] = useState<PetCompanionSnapshot>(EMPTY_SNAPSHOT);
  const snapshotRef = useRef(snapshot);
  const statusesRef = useRef(new Map<string, string>());
  const initializedRef = useRef(false);

  useEffect(() => { snapshotRef.current = snapshot; }, [snapshot]);

  const refresh = useCallback(async () => {
    try {
      // These local API calls are independent. Start them together to avoid a
      // request waterfall every polling interval.
      const [{ runs }, evidence] = await Promise.all([agentApi.list(), evidenceApi.summary()]);
      const state = summarizePetRuns(runs, Number(evidence.pending ?? 0));
      const nextStatuses = new Map(runs.map((run) => [run.id, run.status]));
      let notice: PetNotice | null = null;
      if (initializedRef.current) {
        for (const run of runs) {
          const previous = statusesRef.current.get(run.id);
          if (isNotifiableTerminal(run.status) && previous !== run.status) {
            notice = runNotice(run);
            break;
          }
        }
      }
      statusesRef.current = nextStatuses;
      initializedRef.current = true;

      const next: PetCompanionSnapshot = {
        ...state,
        notice,
        summaryText: petSummaryText(state),
      };
      setSnapshot(next);
      emitPetState(next);
      if (notice) emitPetCelebrate({ ...next, ...notice });
    } catch {
      // The companion is decorative. A temporarily unavailable backend must
      // never interrupt a research task or leave a retrying request behind.
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      initializedRef.current = false;
      statusesRef.current.clear();
      return;
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  useEffect(() => {
    const cleanups = [
      listenForPetEvent<unknown>('pet:hide', () => setPetEnabled(false)),
      listenForPetEvent<unknown>('pet:ready', () => emitPetState(snapshotRef.current)),
      listenForPetEvent<unknown>('pet:summary-request', () => requestPetSummary(snapshotRef.current)),
    ];
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [setPetEnabled]);

  // 桌宠只活在桌面独立透明窗。浏览器 / Hermes 预览禁止再嵌一只角落鹤。
  if (!enabled || nativeActive || !isDesktopTauri()) return null;
  return (
    <FloatingCrane
      snapshot={snapshot}
      onHide={() => setPetEnabled(false)}
      onShowTasks={() => setView('tasks')}
    />
  );
}
