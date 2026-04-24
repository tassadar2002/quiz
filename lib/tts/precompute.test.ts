import { describe, it, expect } from 'vitest';
import {
  jobsForQuestions,
  runJobs,
  type AudioQuestion,
  type Progress,
} from './precompute';
import { fakeControl } from './fake-control';

const Q: AudioQuestion = {
  id: 'q-uuid-1',
  stem: 'What is the meaning of "fox"?',
  options: ['cat', 'dog', 'fox'],
};

describe('jobsForQuestions', () => {
  it('produces 4 jobs per question (1 stem + 3 options)', () => {
    const jobs = jobsForQuestions([Q]);
    expect(jobs).toHaveLength(4);
    expect(jobs.map((j) => j.field)).toEqual([
      'stem',
      'option0',
      'option1',
      'option2',
    ]);
  });
});

describe('runJobs', () => {
  it('first run generates all; second run all cached', async () => {
    const jobs = jobsForQuestions([Q]);
    const first = await runJobs(jobs, () => {});
    expect(first.total).toBe(4);
    expect(first.generated).toBe(4);
    expect(first.cached).toBe(0);
    expect(first.failed).toBe(0);

    const second = await runJobs(jobs, () => {});
    expect(second.cached).toBe(4);
    expect(second.generated).toBe(0);
    expect(second.failed).toBe(0);
  });

  it('reports failed without aborting other jobs', async () => {
    fakeControl.ttsFailForText.add('cat');
    const jobs = jobsForQuestions([Q]);
    const final = await runJobs(jobs, () => {});
    expect(final.total).toBe(4);
    expect(final.failed).toBe(1);
    expect(final.generated).toBe(3);
    expect(final.lastError).toMatch(/text="cat"/);
  });

  it('emits monotonic progress callbacks', async () => {
    const jobs = jobsForQuestions([Q]);
    const seen: Progress[] = [];
    await runJobs(jobs, (p) => seen.push({ ...p }));
    expect(seen.length).toBe(4);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.done).toBeGreaterThanOrEqual(seen[i - 1]!.done);
    }
    expect(seen[seen.length - 1]!.done).toBe(4);
  });

  it('force=true bypasses the cache', async () => {
    const jobs = jobsForQuestions([Q]);
    await runJobs(jobs, () => {});
    fakeControl.calls.length = 0;
    const final = await runJobs(jobs, () => {}, { force: true });
    expect(final.generated).toBe(4);
    expect(final.cached).toBe(0);
    const ttsCalls = fakeControl.calls.filter((c) => c.kind === 'tts').length;
    expect(ttsCalls).toBe(4);
  });
});
