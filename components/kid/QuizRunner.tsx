'use client';
import { useMemo, useState } from 'react';
import { shuffle } from '@/lib/utils/shuffle';
import { gradeQuiz, type GradeResult } from '@/lib/db/actions/grade';

type Q = {
  id: string;
  stem: string;
  options: string[];
  category: 'vocab' | 'sentence' | 'reading';
};

type ShuffledQ = Q & { displayedOptions: string[] };

const LETTER = ['A', 'B', 'C'];

export function QuizRunner({
  questions,
  ownerType,
  ownerId,
}: {
  questions: Q[];
  ownerType: 'title' | 'chapter';
  ownerId: string;
}) {
  const shuffled = useMemo<ShuffledQ[]>(() => {
    return shuffle(questions).map((q) => ({
      ...q,
      displayedOptions: shuffle(q.options),
    }));
  }, [questions]);

  const [phase, setPhase] = useState<'quiz' | 'grading' | 'result'>('quiz');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [chosenTexts, setChosenTexts] = useState<string[]>([]);
  const [result, setResult] = useState<GradeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (questions.length === 0) {
    return <p className="text-ink-700">这组题目还没准备好。</p>;
  }

  async function submit(finalChoices: string[]) {
    setPhase('grading');
    setError(null);
    try {
      const res = await gradeQuiz({
        ownerType,
        ownerId,
        answers: shuffled.map((q, i) => ({
          questionId: q.id,
          chosenOptionText: finalChoices[i]!,
        })),
      });
      setResult(res);
      setPhase('result');
    } catch {
      setError('评分失败，请重试。');
      setPhase('quiz');
    }
  }

  function restart() {
    setPhase('quiz');
    setCurrentIndex(0);
    setChosenTexts([]);
    setResult(null);
    setError(null);
  }

  if (phase === 'grading') {
    return <p className="text-ink-700">评分中…</p>;
  }

  if (phase === 'quiz') {
    const q = shuffled[currentIndex]!;
    return (
      <div className="space-y-4">
        <div className="text-sm text-ink-700">
          第 {currentIndex + 1} / {shuffled.length} 题
        </div>
        <h2 className="text-xl font-semibold">{q.stem}</h2>
        {error && <p className="text-sm text-danger">{error}</p>}
        <ul className="space-y-2">
          {q.displayedOptions.map((opt, i) => (
            <li key={i}>
              <button
                className="card w-full text-left hover:border-primary-500"
                onClick={() => {
                  const next = [...chosenTexts, opt];
                  setChosenTexts(next);
                  if (next.length === shuffled.length) {
                    void submit(next);
                  } else {
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

  // phase === 'result'
  if (!result) return null;
  return (
    <div className="space-y-6">
      <div className="card text-center">
        <p className="text-2xl font-bold">
          得分 {result.score} / {result.total}
        </p>
      </div>
      <h2 className="text-lg font-semibold">错题</h2>
      {result.wrong.length === 0 ? (
        <p className="text-success">🎉 全对了！</p>
      ) : (
        <ul className="space-y-3">
          {result.wrong.map((w) => (
            <WrongRow key={w.questionId} item={w} />
          ))}
        </ul>
      )}
      <button className="btn-ghost" onClick={restart}>
        再做一次
      </button>
    </div>
  );
}

function WrongRow({
  item,
}: {
  item: {
    stem: string;
    options: string[];
    correctIndex: number;
    chosenIndex: number;
    explanation: string;
  };
}) {
  const [open, setOpen] = useState(false);
  return (
    <li className="card">
      <button className="w-full text-left" onClick={() => setOpen(!open)}>
        <p className="font-medium">{item.stem}</p>
        <p className="mt-1 text-sm">
          你选了{' '}
          <span className="text-danger">
            {item.chosenIndex >= 0 ? LETTER[item.chosenIndex] : '(未记录)'}
          </span>
          ，正确答案 <span className="text-success">{LETTER[item.correctIndex]}</span>
        </p>
      </button>
      {open && (
        <div className="mt-3 space-y-2 text-sm">
          <ul>
            {item.options.map((opt, i) => (
              <li key={i} className={i === item.correctIndex ? 'text-success' : ''}>
                {LETTER[i]} · {opt}
              </li>
            ))}
          </ul>
          <p className="rounded bg-ink-100 p-2 text-ink-900">{item.explanation}</p>
        </div>
      )}
    </li>
  );
}
