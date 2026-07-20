'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/firestore-schema';

import { LEGACY_SCHOOL_ID } from '@/lib/paths';

const MODES: { role: UserRole; label: string; icon: string; desc: string; color: string }[] = [
  { role: 'teacher', label: '선생님', icon: '👩‍🏫', desc: '반 만들기·수업 등록·작품 승인', color: '#E8604C' },
  { role: 'student', label: '학생', icon: '🎒', desc: '우리 반 바로가기·작품 올리기', color: '#3BAF9F' },
  { role: 'parent', label: '학부모', icon: '👨‍👩‍👧', desc: '자녀 반 바로가기·관람', color: '#4A90D9' },
];

export default function RoleSwitcher() {
  const router = useRouter();
  const { actualRole, viewAs, setViewAs } = useAuth();
  const [open, setOpen] = useState(false);
  const [classes, setClasses] = useState<{ id: string; label: string }[]>([]);
  const [classId, setClassId] = useState('');
  const pathname = usePathname();
  // 지금 보고 있는 학교 기준으로 반 목록을 불러온다
  const schoolId = pathname?.match(/^\/school\/([^/]+)/)?.[1] || LEGACY_SCHOOL_ID;

  useEffect(() => {
    if (actualRole !== 'super_admin' || !db) return;
    (async () => {
      try {
        const snap = await getDocs(
          query(collection(db!, 'schools', schoolId, 'classes'), where('isArchived', '==', false))
        );
        const list = snap.docs
          .map((d) => ({ id: d.id, label: `${d.data().grade}-${d.data().classNumber}반` }))
          .sort((a, b) => a.id.localeCompare(b.id));
        setClasses(list);
        setClassId((prev) => prev || viewAs?.classId || list[0]?.id || '');
      } catch {
        setClasses([]);
      }
    })();
  }, [actualRole, viewAs, schoolId]);

  // 슈퍼 관리자에게만 보인다
  if (actualRole !== 'super_admin') return null;

  const apply = (role: UserRole) => {
    if (!classId && role !== 'teacher') return;
    setViewAs({ role, classId });
    setOpen(false);
    router.push('/');
  };

  const exit = () => {
    setViewAs(null);
    setOpen(false);
    router.push('/');
  };

  return (
    <>
      {/* 현재 모드 배지 + 플로팅 토글 (화면 요소와 겹치지 않게 우측 하단에 모아둔다) */}
      <div className="fixed right-4 z-[60] flex flex-col items-end gap-1.5" style={{ bottom: '5.5rem' }}>
        {viewAs && (
          <div
            className="flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 shadow-lg"
            style={{ background: '#FFD93D', color: '#7A5800' }}
          >
            <span className="text-[10px] font-bold whitespace-nowrap">
              {MODES.find((m) => m.role === viewAs.role)?.label} 모드
              {viewAs.role !== 'teacher' && ` · ${viewAs.classId}`}
            </span>
            <button
              onClick={exit}
              className="rounded-full px-2 py-0.5 text-[9px] font-bold"
              style={{ background: '#7A5800', color: '#FFF8E7' }}
            >
              종료
            </button>
          </div>
        )}
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex h-11 w-11 items-center justify-center rounded-full text-lg shadow-lg transition-transform hover:scale-110"
          style={{
            background: viewAs ? '#FFD93D' : 'var(--color-surface)',
            border: '2.5px solid #EFE3CB',
          }}
          title="역할 테스트"
        >
          🧪
        </button>
      </div>

      {/* 선택 패널 */}
      {open && (
        <div
          className="fixed inset-0 z-[61] flex items-end sm:items-center justify-center px-4 pb-4"
          style={{ background: 'rgba(15,23,42,0.45)', backdropFilter: 'blur(3px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            className="modal-card w-full max-w-[380px] rounded-3xl p-5"
            style={{ background: 'var(--color-surface)' }}
          >
            <div className="text-center mb-4">
              <div className="text-2xl mb-1">🧪</div>
              <h3 className="text-base font-bold" style={{ color: 'var(--color-text-main)' }}>역할 테스트</h3>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                다른 역할의 화면을 그대로 체험해봅니다.<br />
                계정 정보는 바뀌지 않아요.
              </p>
            </div>

            {/* 테스트할 반 */}
            {classes.length > 0 && (
              <div className="mb-3">
                <div className="text-[11px] font-bold mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                  테스트할 반 (학생·학부모 모드)
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {classes.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setClassId(c.id)}
                      className="rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                      style={{
                        background: classId === c.id ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                        color: classId === c.id ? 'white' : 'var(--color-text-sub)',
                      }}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              {MODES.map((m) => {
                const active = viewAs?.role === m.role;
                return (
                  <button
                    key={m.role}
                    onClick={() => apply(m.role)}
                    className="flex items-center gap-3 rounded-2xl p-3 text-left transition-all"
                    style={{
                      background: active ? m.color + '18' : 'var(--color-surface-soft)',
                      border: active ? `2px solid ${m.color}` : '2px solid transparent',
                    }}
                  >
                    <span className="text-2xl">{m.icon}</span>
                    <div className="min-w-0">
                      <div className="text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                        {m.label} 모드{active && ' · 사용 중'}
                      </div>
                      <div className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <button
              onClick={exit}
              className="w-full mt-3 rounded-2xl py-3 text-sm font-bold"
              style={{
                background: viewAs ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                color: viewAs ? 'white' : 'var(--color-text-sub)',
              }}
            >
              {viewAs ? '↩️ 슈퍼 관리자로 돌아가기' : '지금은 슈퍼 관리자'}
            </button>

            <p className="text-[10px] text-center mt-3 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
              ⚠️ 화면(UI)만 해당 역할로 바뀝니다. 데이터 접근 권한은 실제 계정 기준이라
              권한 차단까지 검증하려면 각 역할로 직접 로그인해야 해요.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
