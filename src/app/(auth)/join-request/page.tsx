'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { UserRole } from '@/lib/firestore-schema';

const GRADES = ['1', '2', '3', '4', '5', '6'];
const CLASS_NUMS = [1, 2, 3, 4, 5, 6];

export default function JoinRequestPage() {
  const { user, userDoc } = useAuth();
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [step, setStep] = useState<'role' | 'student-class'>('role');
  const [grade, setGrade] = useState<string | null>(null);
  const [classNum, setClassNum] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      router.replace('/login');
    } else if (userDoc?.role) {
      router.replace('/school');
    }
  }, [user, userDoc, router]);

  if (!user || userDoc?.role) {
    return null;
  }

  const roles: { value: UserRole; label: string; icon: string; desc: string }[] = [
    { value: 'teacher', label: '선생님', icon: '👩‍🏫', desc: '반 만들기, 수업(활동) 등록, 작품 승인' },
    { value: 'student', label: '학생', icon: '🎒', desc: '내 반에 작품 올리기, 감상평 쓰기' },
    { value: 'parent', label: '학부모', icon: '👨‍👩‍👧', desc: '아이 작품 관람, 감상평 쓰기' },
  ];

  const handleRoleNext = () => {
    if (!selectedRole) return;
    if (selectedRole === 'student') {
      setStep('student-class');
    } else {
      saveAndGo(selectedRole, []);
    }
  };

  const handleStudentDone = () => {
    if (!grade || !classNum) return;
    saveAndGo('student', [`${grade}-${classNum}`]);
  };

  const saveAndGo = async (role: UserRole, classIds: string[]) => {
    if (!user || !db) return;
    setLoading(true);
    await updateDoc(doc(db, 'users', user.uid), { role, classIds });
    router.replace('/avatar-select');
  };

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #FFFFFF 100%)' }}
    >
      {step === 'role' && (
        <>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
            반가워요, {user.displayName}!
          </h1>
          <p className="text-sm mb-8" style={{ color: 'var(--color-text-sub)' }}>
            어떤 역할로 참여하시나요?
          </p>

          <div className="flex flex-col gap-3 w-full max-w-[320px]">
            {roles.map((r) => (
              <button
                key={r.value}
                onClick={() => setSelectedRole(r.value)}
                className="flex items-center gap-4 rounded-2xl p-4 text-left transition-all shadow-sm"
                style={{
                  background: selectedRole === r.value ? 'var(--color-surface)' : 'rgba(255,255,255,0.8)',
                  border: selectedRole === r.value ? '3px solid var(--color-primary)' : '2px solid transparent',
                  transform: selectedRole === r.value ? 'scale(1.03)' : 'scale(1)',
                }}
              >
                <span className="text-3xl">{r.icon}</span>
                <div>
                  <div className="font-bold text-sm" style={{ color: 'var(--color-text-main)' }}>{r.label}</div>
                  <div className="text-xs" style={{ color: 'var(--color-text-sub)' }}>{r.desc}</div>
                </div>
              </button>
            ))}
          </div>

          {selectedRole === 'parent' && (
            <div
              className="mt-4 w-full max-w-[320px] rounded-xl px-4 py-3 text-[11px] leading-relaxed"
              style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-sub)' }}
            >
              💡 학부모님은 지금은 관람 위주로 이용할 수 있어요. 담임 선생님이 학생 명부를 등록하면
              내 아이와 자동으로 연결됩니다.
            </div>
          )}

          <button
            onClick={handleRoleNext}
            disabled={!selectedRole || loading}
            className="mt-8 rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
            style={{ background: 'var(--color-primary)' }}
          >
            {loading ? '처리 중...' : '다음으로'}
          </button>
        </>
      )}

      {step === 'student-class' && (
        <>
          <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>
            몇 학년 몇 반인가요? 🎒
          </h1>
          <p className="text-sm mb-6" style={{ color: 'var(--color-text-sub)' }}>
            우리 반을 알려주면 바로 들어갈 수 있어요
          </p>

          <div className="w-full max-w-[320px] mb-4">
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>학년</div>
            <div className="grid grid-cols-6 gap-2">
              {GRADES.map((g) => (
                <button
                  key={g}
                  onClick={() => setGrade(g)}
                  className="rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{
                    background: grade === g ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
                    color: grade === g ? 'white' : 'var(--color-text-main)',
                    transform: grade === g ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full max-w-[320px] mb-8">
            <div className="text-xs font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>반</div>
            <div className="grid grid-cols-6 gap-2">
              {CLASS_NUMS.map((n) => (
                <button
                  key={n}
                  onClick={() => setClassNum(n)}
                  className="rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{
                    background: classNum === n ? 'var(--color-primary)' : 'rgba(255,255,255,0.85)',
                    color: classNum === n ? 'white' : 'var(--color-text-main)',
                    transform: classNum === n ? 'scale(1.08)' : 'scale(1)',
                  }}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          {grade && classNum && (
            <div className="mb-6 text-sm font-bold" style={{ color: 'var(--color-primary-dark)' }}>
              ✨ {grade}학년 {classNum}반이군요!
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => setStep('role')}
              className="rounded-full px-6 py-3 font-bold shadow-md"
              style={{ background: 'rgba(255,255,255,0.9)', color: 'var(--color-text-sub)' }}
            >
              ← 이전
            </button>
            <button
              onClick={handleStudentDone}
              disabled={!grade || !classNum || loading}
              className="rounded-full px-8 py-3 font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:scale-100"
              style={{ background: 'var(--color-primary)' }}
            >
              {loading ? '처리 중...' : '완료!'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
