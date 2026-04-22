'use client';
import { useMemo, useState } from 'react';
import { shuffle } from '@/lib/utils/shuffle';

type Q = {
  id: string;
  stem: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  category: 'vocab' | 'sentence' | 'reading';
};

type ShuffledQ = Q & { displayedOptions: string[]; displayedToOriginal: number[] };

const LETTER = ['A', 'B', 'C'];

export function QuizRunner({ questions }: { questions: Q[] }) {
  const shuffled = useMemo<ShuffledQ[]>(() => {
    return shuffle(questions).map((q) => {
      const indices = shuffle([0, 1, 2]);
      return {
        ...q,
        displayedOptions: indices.map((i) => q.options[i]!),
        displayedToOriginal: indices,
      };
    });
  }, [questions]);

  const [phase, setPhase] = useState<'quiz' | 'result'>('quiz');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  if (questions.length === 0) {
    return <p className="text-ink-700">这组题目还没准备好。</p>;
  }

  if (phase === 'quiz') {
    const q = shuffled[currentIndex]!;
    return (
      <div className="space-y-4">
        <div className="text-sm text-ink-700">
          第 {currentIndex + 1} / {shuffled.length} 题
        </div>
        <h2 className="text-xl font-semibold">{q.stem}</h2>
        <ul className="space-y-2">
          {q.displayedOptions.map((opt, i) => (
            <li key={i}>
              <button
                className="card w-full text-left hover:border-primary-500"
                onClick={() => {
                  const next = [...answers, i];
                  if (next.length === shuffled.length) {
                    setAnswers(next);
                    setPhase('result');
                  } else {
                    setAnswers(next);
                    setCurrentIndex(currentIndex + 1);
                  }
                }}
              >
                <span className="mr-2 text-ink-700">{LETTER[i]}.</span>
                {opt}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  const results = shuffled.map((q, i) => {
    const displayedAns = answers[i]!;
    const originalAns = q.displayedToOriginal[displayedAns]!;
    const correct = originalAns === q.correctIndex;
    return { q, displayedAns, originalAns, correct };
  });
  const score = results.filter((r) => r.correct).length;

  return (
    <div className="space-y-6">
      <div className="card text-center">
        <p className="text-2xl font-bold">
          得分 {score} / {shuffled.length}
        </p>
      </div>
      <h2 className="text-lg font-semibold">错题</h2>
      {results.filter((r) => !r.correct).length === 0 ? (
        <p className="text-success">🎉 全对了！</p>
      ) : (
        <ul className="space-y-3">
          {results
            .filter((r) => !r.correct)
            .map(({ q, originalAns }) => (
              <WrongRow key={q.id} q={q} chose={originalAns} />
            ))}
        </ul>
      )}
      <button
        className="btn-ghost"
        onClick={() => {
          setPhase('quiz');
          setCurrentIndex(0);
          setAnswers([]);
        }}
      >
        再做一次
      </button>
    </div>
  );
}

function WrongRow({
  q,
  chose,
}: {
  q: { stem: string; options: string[]; correctIndex: number; explanation: string };
  chose: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="card">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <p className="font-medium">{q.stem}</p>
        <p className="mt-1 text-sm">
          你选了 <span className="text-danger">{LETTER[chose]}</span>，正确答案{' '}
          <span className="text-success">{LETTER[q.correctIndex]}</span>
        </p>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          <ul>
            {q.options.map((opt, i) => (
              <li key={i} className={i === q.correctIndex ? 'text-success' : ''}>
                {LETTER[i]} · {opt}
              </li>
            ))}
          </ul>
          <p className="rounded bg-ink-100 p-2 text-ink-900">{q.explanation}</p>
        </div>
      )}
    </li>
  );
}
