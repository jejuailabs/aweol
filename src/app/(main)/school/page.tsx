'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { APP_IMAGES } from '@/lib/image-urls';
import Mascot from '@/components/mascot/Mascot';

const SCHOOL_ID = 'aewol-elementary';

export default function SchoolPage() {
  const { user, userDoc, role } = useAuth();
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

  const classButtons = classes.length > 0
    ? classes.map((cls) => ({ id: cls.id, label: `${cls.grade}-${cls.classNumber}` }))
    : ['3-1', '3-2', '3-3', '3-4'].map((label) => ({ id: label, label }));

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 학교 전경 일러스트 배경 */}
      <div className="absolute inset-0">
        <img
          src={APP_IMAGES.schoolEventMain}
          alt="애월초등학교"
          className="w-full h-full object-cover object-top"
        />
      </div>

      {/* 학교 이름 오버레이 */}
      <div className="absolute top-[52%] left-1/2 -translate-x-1/2 z-20">
        <div className="rounded-lg px-6 py-1.5 backdrop-blur-sm" style={{ background: 'rgba(255,245,230,0.85)' }}>
          <h1 className="text-lg font-bold tracking-wide" style={{ color: '#5B4A3B' }}>
            애월초등학교
          </h1>
        </div>
      </div>

      {/* 상단 로그인/프로필 버튼 */}
      <div className="absolute top-4 right-4 z-40">
        {user ? (
          <div
            className="w-10 h-10 rounded-full overflow-hidden border-2 shadow-lg"
            style={{ borderColor: 'var(--color-primary)' }}
          >
            {userDoc?.photoURL ? (
              <img src={userDoc.photoURL} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-white text-sm font-bold" style={{ color: 'var(--color-text-main)' }}>
                {userDoc?.displayName?.[0] || '?'}
              </div>
            )}
          </div>
        ) : (
          <button
            onClick={() => router.push('/login')}
            className="flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 active:scale-95"
            style={{ background: 'rgba(62, 196, 109, 0.9)', backdropFilter: 'blur(8px)' }}
          >
            🔑 로그인
          </button>
        )}
      </div>

      {/* 우측 반 선택 탭 */}
      <div className="absolute right-3 top-[30%] flex flex-col gap-2.5 z-30">
        {classButtons.map((cls) => (
          <button
            key={cls.id}
            onClick={() => handleClassSelect(cls.id)}
            className="rounded-2xl px-5 py-3 text-sm font-bold shadow-lg transition-all"
            style={{
              background: selectedId === cls.id ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)',
              border: selectedId === cls.id ? '3px solid var(--color-primary)' : '2px solid rgba(255,255,255,0.6)',
              transform: selectedId === cls.id ? 'scale(1.12) translateX(-6px)' : 'scale(1)',
              boxShadow: selectedId === cls.id
                ? '0 4px 20px rgba(62,196,109,0.4)'
                : '0 2px 10px rgba(0,0,0,0.12)',
              color: '#2B2B2B',
            }}
          >
            {cls.label}
          </button>
        ))}
      </div>

      {/* 마스코트 + 말풍선 */}
      {showMascot && (
        <Mascot
          message="원하는 반을 선택해 입장하세요!"
          onDismiss={() => setShowMascot(false)}
        />
      )}
    </div>
  );
}
