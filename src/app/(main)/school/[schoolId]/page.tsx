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
import SchoolPetPanel, { loadPet, createPet, type PetState } from '@/components/school/SchoolPetPanel';
import { PET_KINDS, petMood } from '@/lib/school-pet';

const SchoolScene = dynamic(() => import('@/components/gallery3d/SchoolScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });


export default function SchoolPage() {
  const { user, userDoc, role } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const [classes, setClasses] = useState<(ClassDoc & { id: string })[]>([]);
  const [schoolName, setSchoolName] = useState('');
  const [schoolImage, setSchoolImage] = useState('');
  const [schoolEmblem, setSchoolEmblem] = useState('');
  const [pet, setPet] = useState<PetState | null>(null);
  const [showPet, setShowPet] = useState(false);
  const [adopting, setAdopting] = useState(false);

  // 동물을 들이는 건 그 학교 교직원만. 아이마다 들이면 매일 동물이 바뀐다.
  const isSchoolStaff = role === 'super_admin'
    || (role === 'teacher' && (userDoc?.schoolIds ?? []).includes(schoolId));
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

  // 학교 동물은 한 번만 읽는다. 기분은 시각으로 계산하니 다시 안 읽어도 된다.
  useEffect(() => {
    loadPet(schoolId).then(setPet).catch(() => setPet(null));
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
      <SchoolScene classes={classButtons} onClassSelect={handleClassSelect} avatarId={userDoc?.avatarId} avatarCustom={userDoc?.avatarCustom} avatarTint={userDoc?.avatarTint} schoolName={schoolName} imageUrl={schoolImage} emblemUrl={schoolEmblem} onEnterHall={() => router.push(`/school/${schoolId}/lobby`)}
        schoolId={schoolId}
        me={user && userDoc ? {
          uid: user.uid,
          look: {
            name: userDoc.displayName || '친구',
            avatarId: userDoc.avatarId ?? null,
            shirt: userDoc.avatarTint?.shirt ?? null,
            hair: userDoc.avatarTint?.hair ?? null,
          },
        } : null}
        pet={pet ? {
          kind: pet.kind,
          name: pet.name,
          // 뭔가 필요할 때만 머리 위에 표시가 뜬다
          needEmoji: petMood(pet.fedAt, pet.wateredAt, pet.pettedAt).need === 'none'
            ? '' : '❗',
        } : null}
        onPetClick={() => setShowPet(true)}
      />

      {/* 기억창고 — 졸업생도 봐야 하니 로그인과 무관하게 보인다 */}
      <button
        onClick={() => router.push(`/school/${schoolId}/archive`)}
        className="absolute right-4 top-[136px] z-30 rounded-full px-4 py-2.5 text-xs font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        📦 기억창고
      </button>

      {/* 운동장으로 — 로그인해야 기록이 남으니 로그인한 사람에게만 보인다 */}
      {userDoc && (
        <button
          onClick={() => router.push(`/school/${schoolId}/track`)}
          className="absolute right-4 top-20 z-30 rounded-full px-4 py-2.5 text-xs font-bold"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
        >
          🏃 운동장 달리기
        </button>
      )}

      {showPet && pet && (
        <SchoolPetPanel
          schoolId={schoolId}
          pet={pet}
          onChanged={setPet}
          onClose={() => setShowPet(false)}
        />
      )}

      {/*
        아직 동물이 없으면 그 학교 선생님에게만 '들이기' 버튼을 보여준다.
        아이에게 보여주면 저마다 다른 동물을 들여 매일 바뀐다.
      */}
      {!pet && isSchoolStaff && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-24 z-30 flex gap-1.5">
          {adopting ? PET_KINDS.map((k) => (
            <button
              key={k.kind}
              onClick={async () => {
                await createPet(schoolId, k.kind, k.label);
                setPet(await loadPet(schoolId));
                setAdopting(false);
              }}
              className="rounded-full px-4 py-2.5 text-xs font-bold"
              style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
            >
              {k.emoji} {k.label}
            </button>
          )) : (
            <button
              onClick={() => setAdopting(true)}
              className="rounded-full px-5 py-2.5 text-xs font-bold"
              style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
            >
              🐾 학교 동물 들이기
            </button>
          )}
        </div>
      )}


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
