'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, query, where, getDocs, getDoc, doc, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/lib/auth-context';
import ShareButton from '@/components/common/ShareButton';
import Mascot from '@/components/mascot/Mascot';
import ProfileMenu from '@/components/navigation/ProfileMenu';

const SchoolScene = dynamic(() => import('@/components/gallery3d/SchoolScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });


export default function SchoolPage() {
  const { userDoc, role } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const [classes, setClasses] = useState<(ClassDoc & { id: string })[]>([]);
  const [schoolName, setSchoolName] = useState('');
  const [schoolImage, setSchoolImage] = useState('');
  const [schoolEmblem, setSchoolEmblem] = useState('');
  const [showMascot, setShowMascot] = useState(true);

  useEffect(() => {
    async function fetchClasses() {
      if (!db) return;
      const q = query(
        collection(db, 'schools', schoolId, 'classes'),
        where('isArchived', '==', false)
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDoc & { id: string }));
      list.sort((a, b) => a.classNumber - b.classNumber);
      setClasses(list);
    }
    fetchClasses();
  }, [schoolId]);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'schools', schoolId))
      .then((s: DocumentSnapshot) => {
        setSchoolName(s.exists() ? (s.data()?.name as string) || '' : '');
        setSchoolImage(s.exists() ? (s.data()?.imageUrl as string) || '' : '');
        setSchoolEmblem(s.exists() ? (s.data()?.emblemUrl as string) || '' : '');
      })
      .catch(() => { setSchoolName(''); setSchoolImage(''); setSchoolEmblem(''); });
  }, [schoolId]);

  const handleClassSelect = (classId: string) => {
    playSound('enter');
    router.push(`/school/${schoolId}/class/${classId}`);
  };

  const classButtons = classes.length > 0
    ? classes.map((cls) => ({ id: cls.id, label: `${cls.grade}-${cls.classNumber}` }))
    : ['3-1', '3-2', '3-3', '3-4'].map((label) => ({ id: label, label }));

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* 3D 학교 전경 — 창문 문패 클릭으로 반 입장 */}
      <SchoolScene classes={classButtons} onClassSelect={handleClassSelect} avatarId={userDoc?.avatarId} avatarCustom={userDoc?.avatarCustom} avatarTint={userDoc?.avatarTint} schoolName={schoolName} imageUrl={schoolImage} emblemUrl={schoolEmblem} />

      {/*
        지도로 돌아가기 — 학교 화면에만 없었다.
        하단 메뉴는 비로그인 관람객에게 안 보이므로, 없으면 지도로 나갈 방법이 아예 없다.
        (교실은 '학교로', 전시실은 '교실로' 가 있는데 여기만 빠져 있었다)
      */}
      <button
        onClick={() => router.push('/')}
        className="ac-btn absolute top-4 left-4 z-40 px-3.5 py-2 text-xs"
      >
        ← 지도로
      </button>

      {/* 상단 로그인/프로필 메뉴 */}
      <div className="absolute top-4 right-4 z-40 flex items-center gap-2">
        <ShareButton title={`${schoolName || '학교'} 전시실`} text="우리 학교 작품 전시를 구경해보세요" />
        <ProfileMenu />
      </div>

      {/* 학생 — 우리 반 바로가기 */}
      {role === 'student' && userDoc?.classIds && userDoc.classIds.length > 0 && (
        <button
          onClick={() => router.push(`/school/${schoolId}/class/${userDoc.classIds[0]}/room`)}
          className="ac-btn ac-btn-green absolute left-4 bottom-24 z-30 px-5 py-2.5 text-sm"
        >
          🎒 우리 반({userDoc.classIds[0]}) 바로가기
        </button>
      )}

      {/* 학부모 — 자녀 반 바로가기 */}
      {role === 'parent' && userDoc?.children && userDoc.children.length > 0 && (
        <div className="absolute left-4 bottom-24 z-30 flex flex-col gap-2">
          <div
            className="text-[10px] font-bold px-2"
            style={{ color: '#FFFFFF', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
          >
            👨‍👩‍👧 내 아이 반 바로가기
          </div>
          {userDoc.children.map((child) => (
            <button
              key={child.studentUid + child.classId}
              onClick={() => router.push(`/school/${schoolId}/class/${child.classId}/room`)}
              className="flex items-center gap-2 rounded-full pl-3 pr-4 py-2 text-xs font-bold shadow-lg transition-transform hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.92)', color: '#2B2B2B' }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-white text-[10px]"
                style={{ background: 'var(--color-primary)' }}
              >
                {child.name?.[0] || '🙂'}
              </span>
              {child.name} · {child.classId}반
            </button>
          ))}
        </div>
      )}

      {/* 모바일 조이스틱 */}
      <MobileJoystick />

      {/* 마스코트 + 말풍선 */}
      {showMascot && (
        <Mascot
          message="운동장을 걸어다니고, 창문의 반 문패를 눌러 입장해봐!"
          onDismiss={() => setShowMascot(false)}
        />
      )}
    </div>
  );
}
