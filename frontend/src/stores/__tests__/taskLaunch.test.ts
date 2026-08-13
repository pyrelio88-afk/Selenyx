import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useAppStore } from '../appStore';

type TaskLaunchState = Pick<ReturnType<typeof useAppStore.getState>, 'currentView' | 'taskLaunchNonce' | 'handledTaskLaunchNonce'>;

let savedState: TaskLaunchState;

beforeEach(() => {
  const state = useAppStore.getState();
  savedState = {
    currentView: state.currentView,
    taskLaunchNonce: state.taskLaunchNonce,
    handledTaskLaunchNonce: state.handledTaskLaunchNonce,
  };
  useAppStore.setState({ currentView: 'projects', taskLaunchNonce: 12, handledTaskLaunchNonce: 12 });
});

afterEach(() => {
  useAppStore.setState(savedState);
});

describe('requestNewTask', () => {
  it('creates a one-shot event that cannot be claimed twice after a remount', () => {
    useAppStore.getState().requestNewTask();
    const state = useAppStore.getState();

    expect(state.currentView).toBe('newTask');
    expect(state.taskLaunchNonce).toBe(13);
    expect(state.claimTaskLaunch(13)).toBe(true);
    expect(useAppStore.getState().claimTaskLaunch(13)).toBe(false);
  });
});
