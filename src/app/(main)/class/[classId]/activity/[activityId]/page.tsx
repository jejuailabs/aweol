'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { collection, getDocs, doc, getDoc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ArtworkDoc, ActivityDoc } from '@/lib/firestore-schema';
import { useAuth } from '@/lib/auth-context';
import { canUploadArtwork } from '@/lib/auth-helpers';
import ArtworkDetailModal from '@/components/artwork/ArtworkDetailModal';
import ArtworkUploadModal from '@/components/artwork/ArtworkUploadModal';

const ExhibitRoom = dynamic(() => import('@/components/gallery3d/Gallery3DView'), { ssr: false });
const MobileJoystick = dynamic(() => import('@/components/gallery3d/MobileJoystick'), { ssr: false });

const SCHOOL_ID = 'aewol-elementary';

interface ArtworkData {
  id: string;
  title: string;
  artistName: string;
  imageUrl: string;
  type: 'flat' | 'sculpture';
  artistComment?: string;
}

export default function ActivityExhibitPage() {
  const router = useRouter();
  const params = useParams();
  const classId = params.classId as string;
  const activityId = params.activityId as string;
  const { role } = useAuth();

  const [activity, setActivity] = useState<ActivityDoc | null>(null);
  const [artworks, setArtworks] = useState<ArtworkData[]>([]);
  const [selectedArtwork, setSelectedArtwork] = useState<ArtworkData | null>(null);
  const [showUpload, setShowUpload] = useState(false);

  const basePath = `schools/${SCHOOL_ID}/classes/${classId}/activities/${activityId}/artworks`;

  const fetchArtworks = useCallback(async () => {
    if (!db) return;
    try {
      const artSnap = await getDocs(
        query(collection(db, basePath), where('status', '==', 'approved'))
      );
      const list = artSnap.docs
        .map((d) => {
          const data = d.data() as ArtworkDoc;
          return {
            id: d.id,
            title: data.title,
            artistName: data.artistName,
            imageUrl: data.imageUrl,
            type: data.type,
            artistComment: data.artistComment,
          };
        });
      setArtworks(list);
    } catch (e) {
      console.error('Failed to fetch artworks:', e);
    }
  }, [basePath]);

  useEffect(() => {
    async function fetchData() {
      if (!db) return;
      const actRef = doc(db, 'schools', SCHOOL_ID, 'classes', classId, 'activities', activityId);
      const actSnap = await getDoc(actRef);
      if (actSnap.exists()) {
        setActivity(actSnap.data() as ActivityDoc);
      }
      fetchArtworks();
    }
    fetchData();
  }, [classId, activityId, fetchArtworks]);

  return (
    <div className="relative w-full h-screen">
      {/* 3D 전시실 */}
      <ExhibitRoom
        artworks={artworks}
        onArtworkClick={(artwork) => setSelectedArtwork(artwork as ArtworkData)}
      />

      {/* 상단 HUD — 한 줄 플렉스 (겹침 방지) */}
      <div className="absolute top-4 left-4 right-4 z-30 flex items-center gap-2">
        <button
          onClick={() => router.push(`/class/${classId}/room`)}
          className="ac-btn shrink-0 px-3.5 py-2 text-xs"
        >
          ← 교실로
        </button>
        <div className="ac-bubble hidden sm:block px-4 py-2 text-xs truncate">
          🖼️ {activity?.title || activityId}
        </div>
        {canUploadArtwork(role) && (
          <button
            onClick={() => setShowUpload(true)}
            className="ac-btn ac-btn-green ml-auto shrink-0 px-3.5 py-2 text-xs"
          >
            + 작품 올리기
          </button>
        )}
      </div>

      {/* 모바일 조이스틱 */}
      {!selectedArtwork && !showUpload && <MobileJoystick />}

      {/* 조작 안내 */}
      {!selectedArtwork && !showUpload && (
        <div className="absolute bottom-6 right-4 z-30 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
          <div className="ac-bubble px-4 py-2.5 text-[10px] leading-relaxed">
            <span className="hidden sm:inline">🚶 WASD 이동 · 🖱️ 드래그로 시점 회전 · ❗ 뜨면 작품 클릭!</span>
            <span className="sm:hidden">🕹️ 조이스틱 이동 · 드래그 회전 · 작품 터치</span>
          </div>
        </div>
      )}

      {/* 작품 상세 모달 */}
      {selectedArtwork && (
        <ArtworkDetailModal
          artwork={selectedArtwork}
          collectionPath={basePath}
          onClose={() => setSelectedArtwork(null)}
        />
      )}

      {/* 작품 업로드 모달 */}
      {showUpload && (
        <ArtworkUploadModal
          collectionPath={basePath}
          onClose={() => setShowUpload(false)}
          onUploaded={fetchArtworks}
        />
      )}
    </div>
  );
}
