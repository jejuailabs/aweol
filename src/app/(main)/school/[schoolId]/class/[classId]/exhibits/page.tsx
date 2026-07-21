'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface Exhibit {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
}

/**
 * 전시실 목록.
 *
 * 전시관(나이스에 없는 학교)에서 배너를 누르면 여기로 온다 — 교실을 거치지 않는다.
 * 학교와 구조가 같아서 **'활동' 을 '전시' 로 부르기만** 한다. 경로도 규칙도 그대로다.
 */
export default function ExhibitsPage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const classId = String(params.classId ?? '');

  const [list, setList] = useState<Exhibit[]>([]);
  const [fetched, setFetched] = useState(false);

  useEffect(() => {
    if (!db) return;
    const base = `schools/${schoolId}/classes/${classId}/activities`;
    getDocs(query(collection(db, base), orderBy('order', 'asc')))
      .then((snap) =>
        setList(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Exhibit, 'id'>) })))
      )
      .catch(() => setList([]))
      .finally(() => setFetched(true));
  }, [schoolId, classId]);

  return (
    <div className="px-4 pt-6 pb-28 mx-auto max-w-[560px]">
      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="ac-btn px-3.5 py-2 text-sm mb-4"
      >
        ← 밖으로
      </button>

      <h1 className="text-xl font-black mb-1" style={{ color: 'var(--color-text-main)' }}>
        🎨 전시
      </h1>
      <p className="text-[14px] mb-5" style={{ color: 'var(--color-text-sub)' }}>
        보고 싶은 전시를 골라주세요.
      </p>

      {fetched && list.length === 0 && (
        <div
          className="rounded-2xl p-8 text-center text-[14px] leading-relaxed"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 전시가 없어요.<br />
          관리 화면에서 첫 전시를 만들어보세요.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {list.map((e) => (
          <button
            key={e.id}
            onClick={() => router.push(`/school/${schoolId}/class/${classId}/activity/${e.id}`)}
            className="w-full rounded-3xl overflow-hidden text-left transition-transform active:scale-[0.98]"
            style={{ background: 'var(--color-surface)', border: '3px solid var(--color-surface-soft)' }}
          >
            {e.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={e.thumbnailUrl} alt="" className="w-full h-36 object-cover" />
            )}
            <div className="p-4">
              <div className="text-[17px] font-black" style={{ color: 'var(--color-text-main)' }}>
                {e.title}
              </div>
              {e.description && (
                <div className="text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                  {e.description}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
