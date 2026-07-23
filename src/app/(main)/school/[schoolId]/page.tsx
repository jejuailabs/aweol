'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, collectionGroup, query, where, limit, getDocs, getDoc, doc, type DocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ClassDoc } from '@/lib/firestore-schema';
import { playSound } from '@/lib/sound';
import { useAuth } from '@/lib/auth-context';
import { isStaff, myClassIds } from '@/lib/auth-helpers';
import { useDailyHint } from '@/lib/daily-hint';
import ShareButton from '@/components/common/ShareButton';
import Mascot from '@/components/mascot/Mascot';
import ProfileMenu from '@/components/navigation/ProfileMenu';
import SchoolPetPanel, { loadPet, createPet, type PetState } from '@/components/school/SchoolPetPanel';
import { PET_KINDS, petMood } from '@/lib/school-pet';

const SchoolScene = dynamic(() => import('@/components/gallery3d/SchoolScene'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });


/**
 * 학교 화면 안내말.
 *
 * **컴포넌트 밖에** 둔다 — 안에 두면 그릴 때마다 새 배열이라 안내가 다시 계산된다.
 * 날마다 하나씩 돌아가며 나온다. 아이가 아직 안 해본 걸 하나씩 알려주는 순서다.
 */
const SCHOOL_HINTS = [
  '운동장을 걸어다니고, 창문의 반 문패를 눌러 입장해봐!',
  '금색 문패가 우리 반이야. 눌러서 들어가 봐!',
  '학교 옆 창고에는 지난 해 작품들이 모여 있어.',
  '운동장에서 친구들과 달리기를 할 수 있어!',
  '학교 현관에 들어가면 오늘의 급식을 볼 수 있어.',
  '같은 시간에 들어온 친구가 있으면 운동장에서 만날 수 있어!',
  '학교 동물에게 밥과 물을 주는 것도 잊지 마.',
];

export default function SchoolPage() {
  const { user, userDoc, role } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;
  const [classes, setClasses] = useState<(ClassDoc & { id: string })[]>([]);
  const [schoolName, setSchoolName] = useState('');
  /** 'gallery' 면 문패 대신 배너를 걸고, 눌렀을 때 교실을 건너뛴다 */
  const [kind, setKind] = useState<'school' | 'gallery'>('school');
  const [schoolImage, setSchoolImage] = useState('');
  const [schoolEmblem, setSchoolEmblem] = useState('');
  const [pet, setPet] = useState<PetState | null>(null);
  const [showPet, setShowPet] = useState(false);
  const [adopting, setAdopting] = useState(false);

  // 동물을 들이는 건 그 학교 교직원만. 아이마다 들이면 매일 동물이 바뀐다.
  const isSchoolStaff = role === 'super_admin'
    || (isStaff(role) && (userDoc?.schoolIds ?? []).includes(schoolId));
  /**
   * 학교 안내는 **하루 한 번**만. 전에는 교실에 갔다 돌아올 때마다 다시 떠서
   * 걸리적거렸다. 문구는 날마다 바뀐다 — 같은 말이 매일 나오면 읽지 않게 된다.
   */
  const hint = useDailyHint('school', SCHOOL_HINTS);
  const [hintOpen, setHintOpen] = useState(true);

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

  /**
   * 전시관 배너에 걸 **작품 한 점**씩.
   *
   * 이름만 걸면 문을 열기 전까지 무슨 전시인지 알 수 없다. 그래서 그 전시실에
   * 실제로 걸린 것 하나를 보여준다.
   *
   * **배너는 최대 넷**이라 질의도 넷이다(반마다 `limit(1)`). 학교 전체 작품을
   * 긁어와서 고르면 반이 늘수록 읽기가 곱으로 커진다.
   * 학교 화면(`kind === 'school'`)에서는 아예 안 부른다 — 거기엔 배너가 없다.
   */
  const [covers, setCovers] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!db || kind !== 'gallery' || classes.length === 0) return;
    const targets = classes.slice(0, 4).map((c) => c.id);
    Promise.all(
      targets.map(async (classId) => {
        try {
          const snap = await getDocs(query(
            collectionGroup(db!, 'artworks'),
            where('classId', '==', classId),
            where('status', '==', 'approved'),
            where('visibility', '==', 'school'),
            limit(1)
          ));
          const v = snap.docs[0]?.data();
          return [classId, (v?.thumbnailUrl as string) || (v?.imageUrl as string) || ''] as const;
        } catch {
          // 못 읽어도 화면은 그대로 뜬다 — 사진만 안 걸린다
          return [classId, ''] as const;
        }
      })
    ).then((pairs) => setCovers(Object.fromEntries(pairs.filter(([, url]) => url))));
  }, [kind, classes]);

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
        // 없으면 학교. 기존 학교 문서는 손댈 필요가 없다.
        setKind(s.exists() && s.data()?.kind === 'gallery' ? 'gallery' : 'school');
      })
      .catch(() => { setSchoolName(''); setSchoolImage(''); setSchoolEmblem(''); setKind('school'); });
  }, [schoolId]);

  const handleClassSelect = (classId: string) => {
    playSound('enter');
    /*
      전시관에는 교실이 없다. 배너를 누르면 전시 목록으로 바로 간다.
      경로와 데이터는 학교와 똑같다 — 거쳐 가는 화면만 다르다.
    */
    router.push(
      kind === 'gallery'
        ? `/school/${schoolId}/class/${classId}/exhibits`
        : `/school/${schoolId}/class/${classId}`
    );
  };

  /**
   * 내 반 — 아이는 자기 반, 선생님은 맡은 반, 학부모는 자녀 반.
   * 창문 문패를 금색으로 띄워서 **찾지 않아도 눈에 들어오게** 한다.
   */
  const myClasses = myClassIds(userDoc);

  /**
   * 문패·배너에 적을 이름.
   *
   * 전시관은 `displayName`(전시 주제)을 쓴다. 없으면 학교와 같은 '3-1'.
   * 학년·반 번호는 그대로 둔다 — 경로도 규칙도 그걸 쓴다.
   */
  const classButtons = classes.length > 0
    ? classes.map((cls) => {
        const topic = (cls as ClassDoc & { displayName?: string }).displayName?.trim() || '';
        return {
          id: cls.id,
          /**
           * **전시관에서는 반 번호로 되돌리지 않는다.**
           * 전시 주제를 아직 안 정했으면 빈 이름으로 두고, 그러면 배너가 안 걸린다.
           * '3-1' 을 대신 걸면 전시관이 학교처럼 보이고, 관람객에게 그 숫자는
           * 아무 뜻도 없다. 학교는 종전대로 반 번호를 쓴다 — 거기서는 그게 이름이다.
           */
          label: kind === 'gallery' ? topic : (topic || `${cls.grade}-${cls.classNumber}`),
          coverUrl: covers[cls.id],
        };
      })
    // 반이 하나도 없을 때 보여주는 맛보기. 전시관에는 지어낸 이름을 걸지 않는다.
    : kind === 'gallery'
      ? []
      : ['3-1', '3-2', '3-3', '3-4'].map((label) => ({ id: label, label }));

  return (
    <div className="scene-page">
      {/*
        3D 학교 전경 — 창문 문패 클릭으로 반 입장.
        운동장 문은 게임 고르는 곳으로 간다. 곧장 달리기가 뜨면 양궁을 못 찾는다.
      */}
      <SchoolScene classes={classButtons} myClasses={myClasses} kind={kind} onClassSelect={handleClassSelect} avatarId={userDoc?.avatarId} avatarCustom={userDoc?.avatarCustom} avatarTint={userDoc?.avatarTint} schoolName={schoolName} imageUrl={schoolImage} emblemUrl={schoolEmblem} onEnterHall={() => router.push(`/school/${schoolId}/lobby`)}
        onEnterArchive={() => router.push(`/school/${schoolId}/archive`)}
        onEnterTrack={() => router.push(`/school/${schoolId}/playground`)}
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

      {/*
        기억창고 — 졸업생도 봐야 하니 로그인과 무관하게 보인다.
        휴대폰에서는 숨긴다. 상단에 버튼이 넷씩 겹쳐 학교가 안 보였고,
        어차피 운동장·창고는 **3D 안에 건물로 서 있어서** 걸어가 들어갈 수 있다.
      */}
      <button
        onClick={() => router.push(`/school/${schoolId}/archive`)}
        className="hidden sm:block absolute right-4 top-[136px] z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        📦 기억창고
      </button>

      {/* 운동장으로 — 로그인해야 기록이 남으니 로그인한 사람에게만 보인다 */}
      {userDoc && (
        <button
          onClick={() => router.push(`/school/${schoolId}/playground`)}
          className="hidden sm:block absolute right-4 top-20 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
          style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
        >
          🏟️ 운동장
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
              className="rounded-full px-4 py-2.5 text-sm font-bold"
              style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
            >
              {k.emoji} {k.label}
            </button>
          )) : (
            <button
              onClick={() => setAdopting(true)}
              className="rounded-full px-5 py-2.5 text-sm font-bold"
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
        className="ac-btn pos-top-safe absolute left-4 z-40 px-3.5 py-2 text-sm"
      >
        ← 지도로
      </button>

      {/* 상단 로그인/프로필 메뉴 */}
      <div className="pos-top-safe absolute right-4 z-40 flex items-center gap-2">
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
            className="text-[12px] font-bold px-2"
            style={{ color: '#FFFFFF', textShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
          >
            👨‍👩‍👧 내 아이 반 바로가기
          </div>
          {userDoc.children.map((child) => (
            <button
              key={child.studentUid + child.classId}
              onClick={() => router.push(`/school/${schoolId}/class/${child.classId}/room`)}
              className="flex items-center gap-2 rounded-full pl-3 pr-4 py-2 text-sm font-bold shadow-lg transition-transform hover:scale-105"
              style={{ background: 'rgba(255,255,255,0.92)', color: '#2B2B2B' }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-white text-[12px]"
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

      {/* 마스코트 + 말풍선 — 오늘 아직 안 봤을 때만 */}
      {hint && hintOpen && (
        <Mascot message={hint} onDismiss={() => setHintOpen(false)} />
      )}
    </div>
  );
}
