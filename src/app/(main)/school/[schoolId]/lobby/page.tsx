'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import SchoolHallModal from '@/components/school/SchoolHallModal';
import type { LobbySpot } from '@/components/gallery3d/SchoolLobbyScene';
import type { SchoolProfile } from '@/lib/firestore-schema';

const SchoolLobbyScene = dynamic(
  () => import('@/components/gallery3d/SchoolLobbyScene'),
  { ssr: false }
);
/**
 * 조이스틱 — 휴대폰에서 **이게 없으면 아예 못 움직인다.**
 * 걸어다니는 3D 화면에는 빠짐없이 있어야 한다.
 */
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

/**
 * 학교 현관 로비.
 *
 * 예전에는 현관문을 누르면 창이 하나 떴다. 그러니 '들어간' 느낌이 없었다.
 * 이제 실제로 로비 안으로 들어가고, 게시판·건의함·액자가 벽에 걸려 있다.
 * 눌렀을 때 뜨는 내용은 예전 창을 그대로 쓴다 — 데이터 쪽은 이미 검증된 코드다.
 */
export default function LobbyPage() {
  const { userDoc } = useAuth();
  const router = useRouter();
  const schoolId = useParams().schoolId as string;

  const [schoolName, setSchoolName] = useState('');
  const [emblemUrl, setEmblemUrl] = useState('');
  const [profile, setProfile] = useState<SchoolProfile | undefined>();
  const [counts, setCounts] = useState<Record<LobbySpot, number>>({
    about: 0, meal: 0, notice: 0, suggest: 0, album: 0,
  });
  const [open, setOpen] = useState<LobbySpot | null>(null);

  useEffect(() => {
    if (!db) return;
    getDoc(doc(db, 'schools', schoolId))
      .then((s) => {
        if (!s.exists()) return;
        const v = s.data();
        /**
         * **전시관에는 현관이 없다.** 여기 있는 것은 학교 소개·급식·건의함이라
         * 전시 보러 온 사람에게는 하나도 맞지 않는다.
         * 3D 에서 문을 잠가뒀지만, 주소를 바로 치면 그대로 열린다 —
         * **화면만 막고 길을 안 막으면 막은 게 아니다.**
         */
        if (v.kind === 'gallery') {
          router.replace(`/school/${schoolId}`);
          return;
        }
        setSchoolName((v.name as string) || '우리 학교');
        setEmblemUrl((v.emblemUrl as string) || '');
        setProfile(v.profile as SchoolProfile | undefined);
      })
      .catch(() => {});
  }, [schoolId, router]);

  /**
   * 게시판 배지 숫자.
   * 공지만 미리 센다 — 아이가 로비에 들어섰을 때 '새 공지가 있나'가 제일 궁금하다.
   * 나머지는 눌렀을 때 창이 알아서 읽는다. 미리 다 세면 안 볼 것까지 읽게 된다.
   */
  useEffect(() => {
    if (!db) return;
    getDocs(query(collection(db, 'schools', schoolId, 'hallNotices'), limit(20)))
      .then((s) => setCounts((c) => ({ ...c, notice: s.size })))
      .catch(() => {});
  }, [schoolId]);

  return (
    <div className="scene-page">
      <SchoolLobbyScene
        schoolName={schoolName}
        emblemUrl={emblemUrl}
        counts={counts}
        avatarId={userDoc?.avatarId}
        avatarCustom={userDoc?.avatarCustom}
        avatarTint={userDoc?.avatarTint}
        onOpen={setOpen}
      />

      <button
        onClick={() => router.push(`/school/${schoolId}`)}
        className="absolute left-4 top-4 z-30 rounded-full px-4 py-2.5 text-sm font-bold"
        style={{ background: '#FFF8E7', color: '#6B5B43', border: '3px solid #EFE3CB', boxShadow: '0 4px 0 #E3D5B8' }}
      >
        ← 밖으로 나가기
      </button>

      {/* 처음 들어왔을 때만 뭘 하면 되는지 알려준다 */}
      {!open && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bottom-24 z-20 rounded-full px-4 py-2 text-[13px] font-bold pointer-events-none"
          style={{ background: 'rgba(255,248,231,0.9)', color: '#6B5B43' }}
        >
          벽에 걸린 게시판을 눌러보세요
        </div>
      )}

      {open && (
        <SchoolHallModal
          schoolId={schoolId}
          schoolName={schoolName || '우리 학교'}
          profile={profile}
          emblemUrl={emblemUrl}
          initialTab={open}
          onClose={() => setOpen(null)}
        />
      )}

      {/* 모바일 조이스틱 */}
      <MobileJoystick />
    </div>
  );
}
