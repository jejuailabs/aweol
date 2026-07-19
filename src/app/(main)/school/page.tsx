'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import Mascot from '@/components/mascot/Mascot';

const SCHOOL_ID = 'aewol-elementary';

export default function SchoolPage() {
  const { userDoc, role } = useAuth();
  const router = useRouter();
  const [classes, setClasses] = useState<(ClassDoc & { id: string })[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showMascot, setShowMascot] = useState(true);

  useEffect(() => {
    if (role === 'parent' && userDoc?.children && userDoc.children.length === 1) {
      router.replace(`/class/${userDoc.children[0].classId}/room`);
      return;
    }

    async function fetchClasses() {
      if (!db) return;
      const q = query(
        collection(db, 'schools', SCHOOL_ID, 'classes'),
        where('isArchived', '==', false)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDoc & { id: string }));
      list.sort((a, b) => a.classNumber - b.classNumber);
      setClasses(list);
    }
    fetchClasses();
  }, [role, userDoc, router]);

  const handleClassSelect = (classId: string) => {
    setSelectedId(classId);
    router.push(`/class/${classId}`);
  };

  return (
    <div
      className="relative min-h-screen"
      style={{ background: 'linear-gradient(180deg, var(--color-sky) 0%, #D4EFFC 40%, var(--color-surface) 100%)' }}
    >
      {/* 학교 건물 배경 영역 */}
      <div className="flex items-center justify-center pt-12 pb-6">
        <div className="text-center">
          <div className="text-7xl mb-3">🏫</div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
            애월초등학교
          </h1>
        </div>
      </div>

      {/* 우측 반 선택 탭 */}
      <div className="absolute right-3 top-28 flex flex-col gap-2 z-30">
        {classes.map((cls) => (
          <button
            key={cls.id}
            onClick={() => handleClassSelect(cls.id)}
            className="rounded-xl px-4 py-3 text-sm font-bold shadow-md transition-all"
            style={{
              background: selectedId === cls.id ? 'var(--color-surface)' : 'rgba(255,255,255,0.7)',
              border: selectedId === cls.id ? '3px solid var(--color-primary)' : '2px solid transparent',
              transform: selectedId === cls.id ? 'scale(1.08)' : 'scale(1)',
              color: 'var(--color-text-main)',
            }}
          >
            {cls.grade}-{cls.classNumber}
          </button>
        ))}

        {classes.length === 0 && (
          <div className="rounded-xl bg-white/70 px-4 py-3 text-xs text-center" style={{ color: 'var(--color-text-sub)' }}>
            학급 없음
          </div>
        )}
      </div>

      {/* 마스코트 */}
      {showMascot && (
        <Mascot
          message="원하는 반을 선택해 입장하세요!"
          onDismiss={() => setShowMascot(false)}
        />
      )}
    </div>
  );
}
