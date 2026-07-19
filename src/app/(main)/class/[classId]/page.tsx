'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';

const SCHOOL_ID = 'aewol-elementary';

export default function ClassInfoPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const [classDoc, setClassDoc] = useState<ClassDoc | null>(null);

  useEffect(() => {
    async function fetchClass() {
      if (!db) return;
      const snap = await getDoc(doc(db, 'schools', SCHOOL_ID, 'classes', classId));
      if (snap.exists()) {
        setClassDoc(snap.data() as ClassDoc);
      }
    }
    fetchClass();
  }, [classId]);

  const handleEnter = () => {
    router.push(`/class/${classId}/room`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="relative mx-4 w-full max-w-[400px] rounded-[24px] p-6 shadow-2xl"
        style={{ background: 'var(--color-surface)' }}
      >
        {/* 닫기 */}
        <button
          onClick={() => router.back()}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full text-lg"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          ✕
        </button>

        {/* 학급 정보 */}
        <div className="text-center mb-5">
          <div className="text-4xl mb-2">🏫</div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
            {classDoc ? `${classDoc.grade}-${classDoc.classNumber}반` : classId}
          </h2>
          {classDoc?.year && (
            <span className="text-xs px-2 py-0.5 rounded-full mt-1 inline-block" style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}>
              {classDoc.year}학년도
            </span>
          )}
        </div>

        <div className="space-y-3 mb-6">
          {classDoc?.teacherName && (
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-surface-soft)' }}>
              <span className="text-xl">👩‍🏫</span>
              <div>
                <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>담임선생님</div>
                <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>{classDoc.teacherName}</div>
              </div>
            </div>
          )}

          {classDoc?.motto && (
            <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-surface-soft)' }}>
              <span className="text-xl">📜</span>
              <div>
                <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>급훈</div>
                <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>"{classDoc.motto}"</div>
              </div>
            </div>
          )}

          {classDoc?.introText && (
            <div className="rounded-xl p-3" style={{ background: 'var(--color-surface-soft)' }}>
              <div className="text-[10px] font-medium mb-1" style={{ color: 'var(--color-text-sub)' }}>학급 소개</div>
              <div className="text-sm leading-relaxed" style={{ color: 'var(--color-text-main)' }}>{classDoc.introText}</div>
            </div>
          )}

          {/* Firestore 데이터 없을 때 데모 */}
          {!classDoc && (
            <>
              <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-surface-soft)' }}>
                <span className="text-xl">👩‍🏫</span>
                <div>
                  <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>담임선생님</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>김선생님</div>
                </div>
              </div>
              <div className="flex items-center gap-3 rounded-xl p-3" style={{ background: 'var(--color-surface-soft)' }}>
                <span className="text-xl">📜</span>
                <div>
                  <div className="text-[10px] font-medium" style={{ color: 'var(--color-text-sub)' }}>급훈</div>
                  <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>"함께 웃고, 함께 자라자"</div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* 입장 버튼 */}
        <button
          onClick={handleEnter}
          className="w-full rounded-2xl py-3.5 font-bold text-white text-base shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98]"
          style={{ background: 'var(--color-primary)' }}
        >
          🚪 교실 입장하기
        </button>
      </div>
    </div>
  );
}
