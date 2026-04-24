import { synthesize } from './azure';
import { exists, upload } from './storage';

export type AudioJob = {
  questionId: string;
  field: 'stem' | 'option0' | 'option1' | 'option2';
  text: string;
};

export type AudioQuestion = {
  id: string;
  stem: string;
  options: string[];
};

const CONCURRENCY = 6;

export function jobsForQuestions(qs: readonly AudioQuestion[]): AudioJob[] {
  const out: AudioJob[] = [];
  for (const q of qs) {
    out.push({ questionId: q.id, field: 'stem', text: q.stem });
    q.options.slice(0, 3).forEach((text, i) => {
      out.push({
        questionId: q.id,
        field: `option${i}` as 'option0' | 'option1' | 'option2',
        text,
      });
    });
  }
  return out;
}

function pathFor(job: AudioJob): string {
  return `${job.questionId}/${job.field}.mp3`;
}

async function runOne(job: AudioJob, force: boolean): Promise<void> {
  const path = pathFor(job);
  if (!force && (await exists(path))) return;
  const buf = await synthesize(job.text);
  await upload(path, buf);
}

export type Progress = {
  done: number;
  total: number;
  cached: number;
  generated: number;
  failed: number;
  lastError?: string;
};

/**
 * Run all jobs with bounded concurrency. Calls onProgress after each job.
 * Returns final counts. Individual job failures are counted but do not abort
 * the batch — caller decides whether to fail the publish based on `failed`.
 */
export async function runJobs(
  jobs: readonly AudioJob[],
  onProgress: (p: Progress) => void,
  opts: { force?: boolean; concurrency?: number } = {},
): Promise<Progress> {
  const force = opts.force ?? false;
  const conc = Math.max(1, opts.concurrency ?? CONCURRENCY);
  const total = jobs.length;
  const progress: Progress = {
    done: 0,
    total,
    cached: 0,
    generated: 0,
    failed: 0,
  };
  if (total === 0) {
    onProgress(progress);
    return progress;
  }

  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= total) return;
      const job = jobs[idx]!;
      const path = pathFor(job);
      try {
        if (!force && (await exists(path))) {
          progress.cached += 1;
        } else {
          await runOne(job, force);
          progress.generated += 1;
        }
      } catch (e) {
        progress.failed += 1;
        progress.lastError = e instanceof Error ? e.message : String(e);
      } finally {
        progress.done += 1;
        onProgress({ ...progress });
      }
    }
  }

  await Promise.all(Array.from({ length: conc }, () => worker()));
  return progress;
}
