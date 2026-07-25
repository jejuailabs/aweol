'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import ShareButton from '@/components/common/ShareButton';
import { playSound } from '@/lib/sound';
import type { MapHall, MapSchool } from '@/components/map/SchoolMap';
import ProfileMenu from '@/components/navigation/ProfileMenu';
import SchoolCreateModal from '@/components/map/SchoolCreateModal';
import type { HallDoc } from '@/lib/art-hall';

const SchoolMap = dynamic(() => import('@/components/map/SchoolMap'), { ssr: false });

export default function MapHomePage() {
  const router = useRouter();
  const { actualRole } = useAuth();
  const [schools, setSchools] = useState<MapSchool[]>([]);
  /** 지도에 함께 서는 개인 전시관 — 공개된 것만 */
  const [halls, setHalls] = useState<MapHall[]>([]);
  const [fetched, setFetched] = useState(false);
  const [entering, setEntering] = useState<MapSchool | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const isSuper = actualRole === 'super_admin';

  const load = useCallback(async () => {
    if (!db) { setFetched(true); return; }
    try {
      const snap = await getDocs(
        query(collection(db, 'schools'), where('isArchived', '==', false))
      );
      const list: MapSchool[] = [];
      for (const d of snap.docs) {
        const v = d.data();
        // 좌표가 없는 옛 데이터는 지도에 올릴 수 없다
        if (typeof v.lat !== 'number' || typeof v.lng !== 'number') continue;
        const classSnap = await getDocs(collection(db, 'schools', d.id, 'classes'));
        list.push({
          id: d.id,
          name: v.name || d.id,
          lat: v.lat,
          lng: v.lng,
          tagline: v.tagline || '',
          imageUrl: v.imageUrl || '',
          classCount: classSnap.size,
        });
      }
      setSchools(list);
    } catch {
      setSchools([]);
    }

    /**
     * 개인 전시관 — **공개된 것만.**
     * 질의 조건이 규칙(`isPublic == true`)과 **정확히 같아야 한다.**
     * 넓게 물으면 문서 하나가 막히는 순간 질의 전체가 실패한다
     * (전시실 갤러리에서 이미 한 번 밟은 함정이다).
     */
    try {
      const hs = await getDocs(
        query(collection(db, 'halls'), where('isPublic', '==', true))
      );
      setHalls(
        hs.docs
          .map((d) => ({ id: d.id, ...(d.data() as HallDoc) }))
          .filter((h) => typeof h.lat === 'number' && typeof h.lng === 'number')
          .map((h) => ({
            id: h.id,
            title: h.title || '이름 없는 전시관',
            lat: h.lat,
            lng: h.lng,
            tagline: h.tagline || '',
            coverUrl: h.coverUrl || '',
            ownerName: h.ownerName || '',
            showCount: h.showCount ?? 0,
          }))
      );
    } catch {
      setHalls([]);
    }

    setFetched(true);
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

  // 입장 연출: 소리 + 확대 트랜지션 후 이동
  const handleSelect = (s: MapSchool) => {
    playSound('enter');
    setEntering(s);
    setTimeout(() => router.push(`/school/${s.id}`), 850);
  };

  return (
    <div className="relative w-full h-dvh overflow-hidden">
      <SchoolMap
        schools={schools}
        onSelect={handleSelect}
        halls={halls}
        onSelectHall={(h) => { playSound('enter'); router.push(`/hall/${h.id}`); }}
      />

      {/* 상단 타이틀 + 프로필 */}
      <div className="pos-top-safe absolute left-4 right-4 z-30 flex items-start gap-2 pointer-events-none">
        {/*
          `min-w-0` 이 없으면 카드가 안 줄어들어 제목이 '…지 / 도' 로 쪼개진다.
          안내문은 휴대폰에서 감춘다 — 좁은 화면에서 세 줄이 되어 지도를 가렸다.
        */}
        <div className="ac-bubble min-w-0 px-4 py-2.5 pointer-events-auto">
          <div className="text-sm font-black whitespace-nowrap overflow-hidden text-ellipsis" style={{ color: '#6B5B43' }}>
            🗺️ 우리 동네 전시 지도
          </div>
          <div className="hidden sm:block text-[12px]" style={{ color: '#A89880' }}>
            학교를 눌러 전시를 보러 가요
          </div>
        </div>
        <div className="ml-auto pointer-events-auto flex items-center gap-2">
          <ShareButton title="우리 동네 전시 지도" text="학교를 눌러 아이들 작품 전시를 보러 가요" />
          <ProfileMenu />
        </div>
      </div>

      {/* 학교가 하나도 없을 때 */}
      {fetched && schools.length === 0 && (
        <div className="absolute inset-0 z-20 flex items-center justify-center px-6 pointer-events-none">
          <div className="ac-bubble px-6 py-5 text-center max-w-[340px]">
            <div className="text-3xl mb-2">🏫</div>
            <div className="text-sm font-bold mb-1" style={{ color: '#6B5B43' }}>
              지도에 올라온 학교가 아직 없어요
            </div>
            <div className="text-[13px] leading-relaxed" style={{ color: '#A89880' }}>
              {isSuper
                ? '아래 + 버튼으로 첫 학교를 만들어보세요'
                : '곧 학교들이 문을 열 예정이에요'}
            </div>
          </div>
        </div>
      )}

      {/*
        왼쪽 아래 — 만들기 단추들.
        **내 전시관은 누구나 연다.** 학교를 세우는 것은 총관리자만이지만,
        자기 전시를 여는 것은 허락을 받을 일이 아니다.
      */}
      <div className="absolute left-4 bottom-28 z-30 flex flex-col items-start gap-2">
        {isSuper && (
          <button
            onClick={() => { playSound('open'); setShowCreate(true); }}
            className="ac-btn ac-btn-green px-4 py-2.5 text-sm"
          >
            + 학교 만들기
          </button>
        )}
        <button
          onClick={() => { playSound('open'); router.push('/my-hall'); }}
          className="ac-btn px-4 py-2.5 text-sm"
        >
          🖼️ 내 전시관
        </button>
      </div>

      {/* 입장 연출 */}
      {entering && (
        <div
          className="absolute inset-0 z-50 flex flex-col items-center justify-center pointer-events-none"
          style={{ animation: 'modal-fade 0.25s ease both' }}
        >
          <div className="absolute inset-0" style={{ background: 'rgba(20,26,32,0.75)', backdropFilter: 'blur(6px)' }} />
          <div className="relative flex flex-col items-center" style={{ animation: 'school-zoom 0.85s cubic-bezier(0.4, 0, 0.2, 1) both' }}>
            <div
              className="h-28 w-28 rounded-3xl overflow-hidden flex items-center justify-center mb-4"
              style={{ background: '#8FD98A', border: '5px solid #FFF8E7', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}
            >
              {entering.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={entering.imageUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                <span className="text-5xl">🏫</span>
              )}
            </div>
            <div className="text-lg font-black text-white mb-1">{entering.name}</div>
            <div className="text-sm" style={{ color: 'rgba(255,255,255,0.75)' }}>
              입장하는 중...
            </div>
          </div>
        </div>
      )}

      {/* 학교 만들기 모달 */}
      {showCreate && (
        <SchoolCreateModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setRefreshKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}
