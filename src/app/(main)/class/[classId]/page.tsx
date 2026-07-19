'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';

const SCHOOL_ID = 'aewol-elementary';

const CLASS_THEMES = [
  { from: '#FF9A8B', to: '#FF6A88', deco: '🎨' },
  { from: '#4FD886', to: '#2E9E56', deco: '🌱' },
  { from: '#74C7EC', to: '#4A90D9', deco: '🐳' },
  { from: '#FFC93C', to: '#F5A623', deco: '🌻' },
  { from: '#C3A6FF', to: '#9B6BD4', deco: '🦄' },
  { from: '#FFB6C1', to: '#F08CA0', deco: '🌸' },
];

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

  const classNumber = classDoc?.classNumber ?? parseInt(classId.split('-')[1] || '1', 10);
  const theme = CLASS_THEMES[(classNumber - 1) % CLASS_THEMES.length];
  const label = classDoc ? `${classDoc.grade}-${classDoc.classNumber}` : classId;
  const teacherName = classDoc?.teacherName || '김선생님';
  const motto = classDoc?.motto || '함께 웃고, 함께 자라자';

  const handleEnter = () => {
    router.push(`/class/${classId}/room`);
  };

  return (
    <div
      className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'rgba(15, 23, 42, 0.55)', backdropFilter: 'blur(6px)' }}
      onClick={() => router.back()}
    >
      {/* 티켓 카드 */}
      <div
        className="modal-card relative w-full max-w-[380px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="relative overflow-hidden rounded-[28px]"
          style={{ background: '#FFFFFF', boxShadow: '0 30px 60px rgba(0,0,0,0.35)' }}
        >
          {/* ---------- 히어로 ---------- */}
          <div
            className="relative px-7 pt-8 pb-10 overflow-hidden"
            style={{ background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)` }}
          >
            {/* 장식 도트 패턴 */}
            <div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.9) 1.5px, transparent 1.5px)',
                backgroundSize: '18px 18px',
              }}
            />
            {/* 떠다니는 장식 */}
            <span className="float-slow absolute top-5 right-6 text-4xl select-none">{theme.deco}</span>
            <span className="float-slower absolute bottom-4 right-16 text-2xl select-none opacity-70">✨</span>

            {/* 닫기 */}
            <button
              onClick={() => router.back()}
              className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-full text-sm font-bold transition-transform hover:scale-110"
              style={{ background: 'rgba(255,255,255,0.3)', color: 'white', backdropFilter: 'blur(4px)' }}
            >
              ✕
            </button>

            <div className="relative">
              <div
                className="inline-block rounded-full px-3 py-1 text-[10px] font-bold tracking-widest mb-3"
                style={{ background: 'rgba(255,255,255,0.25)', color: 'white', letterSpacing: '0.15em' }}
              >
                CLASS EXHIBITION TICKET
              </div>
              <div className="flex items-end gap-3">
                <span
                  className="text-[64px] leading-none font-black text-white"
                  style={{ textShadow: '0 4px 14px rgba(0,0,0,0.2)' }}
                >
                  {label}
                </span>
                <span className="text-white text-lg font-bold mb-2 opacity-90">반 전시실</span>
              </div>
              {classDoc?.year && (
                <div className="mt-2 text-[11px] font-medium text-white opacity-80">
                  {classDoc.year}학년도 · 애월초등학교
                </div>
              )}
            </div>
          </div>

          {/* ---------- 절취선 ---------- */}
          <div className="relative h-0">
            <div
              className="absolute -left-3 -top-3 w-6 h-6 rounded-full"
              style={{ background: 'rgba(15, 23, 42, 0.0)', boxShadow: 'inset 0 0 0 100px rgba(15,23,42,0.55)' }}
            />
            <div
              className="absolute -right-3 -top-3 w-6 h-6 rounded-full"
              style={{ boxShadow: 'inset 0 0 0 100px rgba(15,23,42,0.55)' }}
            />
            <div
              className="absolute left-5 right-5 -top-px border-t-2 border-dashed"
              style={{ borderColor: '#E5E7EB' }}
            />
          </div>

          {/* ---------- 정보 ---------- */}
          <div className="px-7 pt-6 pb-7">
            <div className="flex items-center gap-3 mb-4">
              <div
                className="flex h-11 w-11 items-center justify-center rounded-2xl text-xl shrink-0"
                style={{ background: theme.from + '26' }}
              >
                👩‍🏫
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: '#9CA3AF' }}>
                  담임선생님
                </div>
                <div className="text-sm font-bold" style={{ color: '#1F2937' }}>{teacherName}</div>
              </div>
            </div>

            <div
              className="rounded-2xl px-4 py-3.5 mb-3 text-center"
              style={{ background: '#F8FAFC', border: '1px solid #EEF2F7' }}
            >
              <div className="text-[10px] font-semibold mb-1" style={{ color: '#9CA3AF' }}>우리 반 급훈</div>
              <div className="text-[15px] font-bold leading-snug" style={{ color: '#374151' }}>
                “{motto}”
              </div>
            </div>

            {classDoc?.introText && (
              <p className="text-xs leading-relaxed mb-3 px-1" style={{ color: '#6B7280' }}>
                {classDoc.introText}
              </p>
            )}

            {/* 입장 버튼 */}
            <button
              onClick={handleEnter}
              className="group w-full rounded-2xl py-4 font-bold text-white text-base transition-all hover:shadow-xl active:scale-[0.98] flex items-center justify-center gap-2"
              style={{
                background: `linear-gradient(135deg, ${theme.from} 0%, ${theme.to} 100%)`,
                boxShadow: `0 10px 24px ${theme.to}55`,
              }}
            >
              🚪 교실 입장하기
              <span className="transition-transform group-hover:translate-x-1">→</span>
            </button>

            <div className="mt-3 text-center text-[10px]" style={{ color: '#B0B7C3' }}>
              로그인 없이 누구나 관람할 수 있어요
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
