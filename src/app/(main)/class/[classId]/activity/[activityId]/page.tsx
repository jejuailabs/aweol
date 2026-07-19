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

      {/* 상단 HUD */}
      <div className="absolute top-4 left-4 z-30 flex items-center gap-3">
        <button
          onClick={() => router.push(`/class/${classId}/room`)}
          className="rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-transform hover:scale-105"
          style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-main)' }}
        >
          ← 교실로
        </button>
        <div
          className="rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md"
          style={{ background: 'rgba(255,255,255,0.85)', color: 'var(--color-text-main)' }}
        >
          🖼️ {activity?.title || activityId}
        </div>
      </div>

      {/* 작품 올리기 버튼 (학생/학부모) */}
      {canUploadArtwork(role) && (
        <button
          onClick={() => setShowUpload(true)}
          className="absolute top-4 right-4 z-30 rounded-full px-4 py-2 text-xs font-bold shadow-lg backdrop-blur-md transition-transform hover:scale-105"
          style={{ background: 'rgba(62,196,109,0.9)', color: 'white' }}
        >
          + 작품 올리기
        </button>
      )}

      {/* 모바일 조이스틱 */}
      {!selectedArtwork && !showUpload && <MobileJoystick />}

      {/* 조작 안내 */}
      {!selectedArtwork && !showUpload && (
        <div className="absolute bottom-6 right-4 z-30 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto">
          <div
            className="rounded-2xl px-4 py-2.5 text-[10px] font-medium shadow-lg backdrop-blur-md leading-relaxed"
            style={{ background: 'rgba(255,255,255,0.8)', color: 'var(--color-text-sub)' }}
          >
            <span className="hidden sm:inline">WASD로 이동 · 작품에 가까이 가면 이름 표시 · 클릭해서 감상</span>
            <span className="sm:hidden">조이스틱으로 이동 · 작품 터치해서 감상</span>
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
