import { describe, it, expect, beforeEach } from 'vitest';
import { autoUnblock, hasUnresolvedBlockers, getPrioritizedTasks, PRIORITY_ORDER } from '../task-logic.js';
import { makeTask, makeBlocker, makeAppData, resetIdCounter } from './helpers.js';

beforeEach(() => {
  resetIdCounter();
});

describe('PRIORITY_ORDER', () => {
  it('orders P0 < P1 < P2', () => {
    expect(PRIORITY_ORDER['P0']).toBeLessThan(PRIORITY_ORDER['P1']);
    expect(PRIORITY_ORDER['P1']).toBeLessThan(PRIORITY_ORDER['P2']);
  });
});

describe('hasUnresolvedBlockers', () => {
  it('returns false when task has no blockers', () => {
    const data = makeAppData({ tasks: [makeTask({ id: 1 })] });
    expect(hasUnresolvedBlockers(1, data)).toBe(false);
  });

  it('returns false when task has only resolved blockers', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 })],
      blockers: [makeBlocker({ taskId: 1, resolved: true })],
    });
    expect(hasUnresolvedBlockers(1, data)).toBe(false);
  });

  it('returns true when task has an unresolved blocker', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 })],
      blockers: [makeBlocker({ taskId: 1, resolved: false })],
    });
    expect(hasUnresolvedBlockers(1, data)).toBe(true);
  });

  it('ignores blockers belonging to other tasks', () => {
    const data = makeAppData({
      tasks: [makeTask({ id: 1 }), makeTask({ id: 2 })],
      blockers: [makeBlocker({ taskId: 2, resolved: false })],
    });
    expect(hasUnresolvedBlockers(1, data)).toBe(false);
  });
});

describe('autoUnblock', () => {
  it('returns false when there are no blockers', () => {
    const data = makeAppData();
    expect(autoUnblock(data)).toBe(false);
  });

  it('returns false when all blockers are already resolved', () => {
    const data = makeAppData({
      blockers: [makeBlocker({ resolved: true })],
    });
    expect(autoUnblock(data)).toBe(false);
  });

  it('resolves a blocker whose date is in the past', () => {
    const blocker = makeBlocker({
      blockedUntilDate: '2020-01-01T00:00:00Z',
      resolved: false,
    });
    const data = makeAppData({ blockers: [blocker] });

    expect(autoUnblock(data)).toBe(true);
    expect(blocker.resolved).toBe(true);
  });

  it('does not resolve a blocker whose date is in the future', () => {
    const blocker = makeBlocker({
      blockedUntilDate: '2099-01-01T00:00:00Z',
      resolved: false,
    });
    const data = makeAppData({ blockers: [blocker] });

    expect(autoUnblock(data)).toBe(false);
    expect(blocker.resolved).toBe(false);
  });

  it('resolves a blocker whose blocking task is completed', () => {
    const blockingTask = makeTask({ id: 10, completedAt: '2024-01-01T00:00:00Z' });
    const blocker = makeBlocker({
      taskId: 1,
      blockedByTaskId: 10,
      resolved: false,
    });
    const data = makeAppData({
      tasks: [makeTask({ id: 1 }), blockingTask],
      blockers: [blocker],
    });

    expect(autoUnblock(data)).toBe(true);
    expect(blocker.resolved).toBe(true);
  });

  it('does not resolve a blocker whose blocking task is not completed', () => {
    const blockingTask = makeTask({ id: 10, completedAt: null });
    const blocker = makeBlocker({
      taskId: 1,
      blockedByTaskId: 10,
      resolved: false,
    });
    const data = makeAppData({
      tasks: [makeTask({ id: 1 }), blockingTask],
      blockers: [blocker],
    });

    expect(autoUnblock(data)).toBe(false);
    expect(blocker.resolved).toBe(false);
  });

  it('resolves only eligible blockers in a mixed scenario', () => {
    const pastBlocker = makeBlocker({
      id: 1,
      blockedUntilDate: '2020-01-01T00:00:00Z',
      resolved: false,
    });
    const futureBlocker = makeBlocker({
      id: 2,
      blockedUntilDate: '2099-01-01T00:00:00Z',
      resolved: false,
    });
    const data = makeAppData({ blockers: [pastBlocker, futureBlocker] });

    expect(autoUnblock(data)).toBe(true);
    expect(pastBlocker.resolved).toBe(true);
    expect(futureBlocker.resolved).toBe(false);
  });

  it('mutates the data object in place', () => {
    const blocker = makeBlocker({
      blockedUntilDate: '2020-01-01T00:00:00Z',
      resolved: false,
    });
    const data = makeAppData({ blockers: [blocker] });

    autoUnblock(data);
    // Verify the original blocker object was mutated
    expect(data.blockers[0].resolved).toBe(true);
  });
});

describe('getPrioritizedTasks', () => {
  describe('filtering', () => {
    it('excludes tasks with null priority (ideas)', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, priority: null })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(0);
    });

    it('excludes archived tasks', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, isArchived: true })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(0);
    });

    it('excludes deleted tasks', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, isDeleted: true })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(0);
    });

    it('excludes completed tasks', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, completedAt: '2024-01-01T00:00:00Z' })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(0);
    });

    it('excludes tasks with unresolved blockers', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1 })],
        blockers: [makeBlocker({ taskId: 1, resolved: false })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(0);
    });

    it('includes tasks that pass all criteria', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, priority: 'P1' })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(1);
    });

    it('includes tasks with resolved blockers', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1 })],
        blockers: [makeBlocker({ taskId: 1, resolved: true })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(1);
    });
  });

  describe('sorting', () => {
    it('sorts P0 before P1 before P2', () => {
      const data = makeAppData({
        tasks: [
          makeTask({ id: 1, priority: 'P2', createdAt: '2024-01-01T00:00:00Z' }),
          makeTask({ id: 2, priority: 'P0', createdAt: '2024-01-02T00:00:00Z' }),
          makeTask({ id: 3, priority: 'P1', createdAt: '2024-01-03T00:00:00Z' }),
        ],
      });
      const result = getPrioritizedTasks(data);
      expect(result.map(t => t.priority)).toEqual(['P0', 'P1', 'P2']);
    });

    it('sorts by createdAt ascending within same priority', () => {
      const data = makeAppData({
        tasks: [
          makeTask({ id: 1, priority: 'P1', createdAt: '2024-03-01T00:00:00Z' }),
          makeTask({ id: 2, priority: 'P1', createdAt: '2024-01-01T00:00:00Z' }),
          makeTask({ id: 3, priority: 'P1', createdAt: '2024-02-01T00:00:00Z' }),
        ],
      });
      const result = getPrioritizedTasks(data);
      expect(result.map(t => t.id)).toEqual([2, 3, 1]);
    });

    it('is stable: changing updatedAt does not affect order', () => {
      const data = makeAppData({
        tasks: [
          makeTask({ id: 1, priority: 'P1', createdAt: '2024-01-01T00:00:00Z', updatedAt: '2025-12-01T00:00:00Z' }),
          makeTask({ id: 2, priority: 'P1', createdAt: '2024-02-01T00:00:00Z', updatedAt: '2024-01-01T00:00:00Z' }),
        ],
      });
      const result = getPrioritizedTasks(data);
      // Task 1 was created earlier, so it comes first regardless of updatedAt
      expect(result.map(t => t.id)).toEqual([1, 2]);
    });
  });

  describe('Tasks/Backlog split simulation', () => {
    it('splits correctly with topN', () => {
      const tasks = Array.from({ length: 25 }, (_, i) =>
        makeTask({
          id: i + 1,
          priority: 'P1',
          createdAt: new Date(2024, 0, i + 1).toISOString(),
        })
      );
      const data = makeAppData({ tasks, settings: { staleThresholdHours: 48, topN: 20, globalTimeOffset: 0 } });

      const prioritized = getPrioritizedTasks(data);
      const tasksTab = prioritized.slice(0, 20);
      const backlogTab = prioritized.slice(20);

      expect(tasksTab).toHaveLength(20);
      expect(backlogTab).toHaveLength(5);
    });

    it('respects priority at the split boundary', () => {
      const tasks = [
        ...Array.from({ length: 5 }, (_, i) =>
          makeTask({ id: i + 1, priority: 'P0', createdAt: new Date(2024, 0, i + 1).toISOString() })
        ),
        ...Array.from({ length: 20 }, (_, i) =>
          makeTask({ id: i + 6, priority: 'P1', createdAt: new Date(2024, 0, i + 1).toISOString() })
        ),
      ];
      const data = makeAppData({ tasks, settings: { staleThresholdHours: 48, topN: 20, globalTimeOffset: 0 } });

      const prioritized = getPrioritizedTasks(data);
      const tasksTab = prioritized.slice(0, 20);
      const backlogTab = prioritized.slice(20);

      // All 5 P0 tasks should be in the Tasks tab
      expect(tasksTab.filter(t => t.priority === 'P0')).toHaveLength(5);
      // First 15 P1 tasks fill the remaining spots
      expect(tasksTab.filter(t => t.priority === 'P1')).toHaveLength(15);
      // Last 5 P1 tasks go to backlog
      expect(backlogTab).toHaveLength(5);
      expect(backlogTab.every(t => t.priority === 'P1')).toBe(true);
    });
  });

  describe('edge cases', () => {
    it('returns empty array when no tasks exist', () => {
      const data = makeAppData();
      expect(getPrioritizedTasks(data)).toEqual([]);
    });

    it('returns empty array when all tasks are filtered out', () => {
      const data = makeAppData({
        tasks: [
          makeTask({ id: 1, isArchived: true }),
          makeTask({ id: 2, isDeleted: true }),
          makeTask({ id: 3, completedAt: '2024-01-01T00:00:00Z' }),
          makeTask({ id: 4, priority: null }),
        ],
      });
      expect(getPrioritizedTasks(data)).toEqual([]);
    });

    it('returns single qualifying task', () => {
      const data = makeAppData({
        tasks: [makeTask({ id: 1, priority: 'P0' })],
      });
      expect(getPrioritizedTasks(data)).toHaveLength(1);
      expect(getPrioritizedTasks(data)[0].id).toBe(1);
    });
  });
});
