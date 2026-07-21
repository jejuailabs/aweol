'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { resizeImage } from '@/lib/client-image';
import { doc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';

interface Props {
  collectionPath: string;
  onClose: () => void;
  onUploaded: () => void;
}

interface QueueItem {
  id: string;
  file: File;
  originalUrl: string;
  enhancedBlob: Blob | null;
  enhancedUrl: string;
  status: 'waiting' | 'enhancing' | 'ready' | 'failed';
  useEnhanced: boolean;
  artistName: string;
  title: string;
  type: 'flat' | 'sculpture';
}

export default function ArtworkUploadModal({ collectionPath, onClose, onUploaded }: Props) {
  const { user, userDoc, role } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<QueueItem[]>([]);
  const [roster, setRoster] = useState<string[]>([]);
  const [bulkTitle, setBulkTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  const isTeacher = canManageClass(role);

  // collectionPath: schools/{schoolId}/classes/{classId}/activities/{activityId}/artworks
  const pathParts = collectionPath.split('/');
  const schoolId = pathParts[1];
  const classId = pathParts[3];

  // 교사용: 학급 명부를 불러와 이름 자동완성에 쓴다 (타이핑 대신 선택)
  useEffect(() => {
    if (!isTeacher || !db || !schoolId || !classId) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'schools', schoolId, 'classes', classId, 'students'));
        const names = snap.docs
          .map((d) => ({ number: (d.data().number as number) || 0, name: (d.data().name as string) || '' }))
          .filter((s) => s.name)
          .sort((a, b) => a.number - b.number)
          .map((s) => s.name);
        setRoster(names);
      } catch {
        setRoster([]);
      }
    })();
  }, [isTeacher, schoolId, classId]);

  // 학생/학부모 본인 업로드면 이름 자동 채움
  useEffect(() => {
    if (!isTeacher && userDoc?.displayName) {
      setItems((prev) => prev.map((it) => (it.artistName ? it : { ...it, artistName: userDoc.displayName })));
    }
  }, [isTeacher, userDoc]);

  useEffect(() => {
    return () => {
      items.forEach((it) => {
        URL.revokeObjectURL(it.originalUrl);
        if (it.enhancedUrl) URL.revokeObjectURL(it.enhancedUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 보정을 순차 처리 (서버 과부하 방지). 교사가 이름을 입력하는 동안 백그라운드로 진행됨
  const enhanceQueue = useCallback(async (targets: QueueItem[]) => {
    for (const item of targets) {
      setItems((prev) => prev.map((it) => (it.id === item.id ? { ...it, status: 'enhancing' } : it)));
      try {
        const fd = new FormData();
        fd.append('image', item.file);
        const res = await fetch('/api/enhance', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('enhance failed');
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        setItems((prev) =>
          prev.map((it) =>
            it.id === item.id ? { ...it, enhancedBlob: blob, enhancedUrl: url, status: 'ready' } : it
          )
        );
      } catch {
        setItems((prev) =>
          prev.map((it) => (it.id === item.id ? { ...it, status: 'failed', useEnhanced: false } : it))
        );
      }
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const defaultName = !isTeacher ? userDoc?.displayName || '' : '';
    const newItems: QueueItem[] = files.map((f, i) => ({
      id: `q-${Date.now()}-${i}`,
      file: f,
      originalUrl: URL.createObjectURL(f),
      enhancedBlob: null,
      enhancedUrl: '',
      status: 'waiting',
      useEnhanced: true,
      artistName: defaultName,
      title: '',
      type: 'flat',
    }));

    setItems((prev) => [...prev, ...newItems]);
    enhanceQueue(newItems);
    e.target.value = '';
  };

  const updateItem = (id: string, patch: Partial<QueueItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string) => {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) {
        URL.revokeObjectURL(target.originalUrl);
        if (target.enhancedUrl) URL.revokeObjectURL(target.enhancedUrl);
      }
      return prev.filter((it) => it.id !== id);
    });
  };

  const applyBulkTitle = () => {
    if (!bulkTitle.trim()) return;
    setItems((prev) => prev.map((it) => ({ ...it, title: it.title.trim() || bulkTitle.trim() })));
  };

  // 명부 순서대로 이름을 일괄 배정 (사진을 번호순으로 찍은 경우 한 번에 끝남)
  const applyRosterInOrder = () => {
    if (roster.length === 0) return;
    setItems((prev) => prev.map((it, i) => ({ ...it, artistName: roster[i] || it.artistName })));
  };

  const readyCount = items.filter((it) => it.artistName.trim() && it.title.trim()).length;
  const stillEnhancing = items.some((it) => it.status === 'enhancing' || it.status === 'waiting');
  const canSubmit = items.length > 0 && readyCount === items.length && !uploading && !stillEnhancing;

  const handleSubmitAll = async () => {
    if (!db || !storage || !user || !canSubmit) return;
    setUploading(true);
    setProgress(0);

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const uploadBlob = it.useEnhanced && it.enhancedBlob ? it.enhancedBlob : it.file;
      const artworkId = `art-${Date.now()}-${i}`;
      const ext = it.useEnhanced && it.enhancedBlob ? 'jpg' : it.file.name.split('.').pop() || 'jpg';
      const storageRef = ref(storage, `artworks/${user.uid}/${artworkId}.${ext}`);

      await uploadBytes(storageRef, uploadBlob);
      const imageUrl = await getDownloadURL(storageRef);

      /**
       * 전시실 액자용 작은 판을 따로 올린다.
       * 액자 12개짜리 방이 원본으로만 뜨면 20MB가 넘어 집에서 한참 안 열린다.
       * 만들지 못하면 원본 주소를 그대로 쓴다 — 썸네일 때문에 업로드가 막히면 안 된다.
       */
      let thumbnailUrl = imageUrl;
      const thumb = await resizeImage(uploadBlob);
      if (thumb) {
        try {
          const thumbRef = ref(storage, `artworks/${user.uid}/${artworkId}-thumb.jpg`);
          await uploadBytes(thumbRef, thumb.blob);
          thumbnailUrl = await getDownloadURL(thumbRef);
        } catch {
          thumbnailUrl = imageUrl;
        }
      }

      await setDoc(doc(db, collectionPath, artworkId), {
        title: it.title.trim(),
        artistName: it.artistName.trim(),
        artistUid: isTeacher ? '' : user.uid,
        imageUrl,
        thumbnailUrl,
        type: it.type,
        artistComment: '',
        uploadedBy: user.uid,
        uploadedByRole: isTeacher ? 'teacher' : role === 'parent' ? 'parent' : 'student',
        uploadedAt: serverTimestamp(),
        // 교사가 직접 올리면 즉시 전시 (본인이 승인권자이므로)
        status: isTeacher ? 'approved' : 'pending',
        rejectionReason: null,
      });

      setProgress(i + 1);
    }

    setUploading(false);
    onUploaded();
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget && !uploading) onClose(); }}
    >
      <div
        className="modal-card w-full max-w-[560px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '90vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-surface-soft)' }} />
        </div>

        <div className="flex items-center justify-between px-5 pt-2 pb-3 sm:pt-5">
          <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>
            🖼️ 작품 올리기 {items.length > 0 && <span className="text-sm">({items.length}점)</span>}
          </h3>
          <button
            onClick={onClose}
            disabled={uploading}
            className="w-8 h-8 flex items-center justify-center rounded-full text-sm disabled:opacity-40"
            style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          {/* 사진 선택 */}
          {items.length === 0 ? (
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full aspect-[4/3] rounded-2xl flex flex-col items-center justify-center gap-2 border-2 border-dashed"
              style={{ borderColor: 'var(--color-surface-soft)', background: 'var(--color-surface-soft)' }}
            >
              <span className="text-4xl">📷</span>
              <span className="text-sm font-bold" style={{ color: 'var(--color-text-sub)' }}>
                {isTeacher ? '작품 사진을 한꺼번에 선택하세요' : '작품 사진을 선택하세요'}
              </span>
              <span className="text-[12px] text-center px-6 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
                {isTeacher
                  ? '여러 장을 한 번에 고를 수 있어요 · AI가 선예도·조명을 자동 보정합니다'
                  : 'AI가 선예도·조명을 자동 보정해요'}
              </span>
            </button>
          ) : (
            <>
              {/* 교사용 일괄 도구 */}
              {isTeacher && (
                <div className="rounded-2xl p-3 mb-3" style={{ background: 'var(--color-surface-soft)' }}>
                  <div className="text-[13px] font-bold mb-2" style={{ color: 'var(--color-text-sub)' }}>
                    ⚡ 한 번에 채우기
                  </div>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={bulkTitle}
                      onChange={(e) => setBulkTitle(e.target.value)}
                      placeholder="공통 작품명 (예: 봄 풍경)"
                      className="flex-1 min-w-0 rounded-lg px-3 py-2 text-sm outline-none"
                      style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                    />
                    <button
                      onClick={applyBulkTitle}
                      disabled={!bulkTitle.trim()}
                      className="shrink-0 rounded-lg px-3 text-sm font-bold text-white disabled:opacity-40"
                      style={{ background: 'var(--color-primary)' }}
                    >
                      전체 적용
                    </button>
                  </div>
                  <button
                    onClick={applyRosterInOrder}
                    disabled={roster.length === 0}
                    className="w-full rounded-lg py-2 text-sm font-bold disabled:opacity-40"
                    style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                  >
                    {roster.length > 0
                      ? `📋 명부 순서대로 이름 채우기 (${roster.length}명)`
                      : '📋 명부가 없어요 — 학생 명부를 먼저 등록하세요'}
                  </button>
                </div>
              )}

              {/* 작품 큐 */}
              <div className="flex flex-col gap-2.5">
                {items.map((it, idx) => {
                  const shown = it.useEnhanced && it.enhancedUrl ? it.enhancedUrl : it.originalUrl;
                  return (
                    <div
                      key={it.id}
                      className="rounded-2xl p-2.5 flex gap-2.5"
                      style={{ background: 'var(--color-surface-soft)' }}
                    >
                      {/* 썸네일 */}
                      <div
                        className="relative w-[72px] h-[72px] shrink-0 rounded-xl overflow-hidden flex items-center justify-center"
                        style={{ background: '#F3F1EC' }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={shown} alt="" className="w-full h-full object-cover" />
                        {(it.status === 'enhancing' || it.status === 'waiting') && (
                          <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{ background: 'rgba(255,255,255,0.75)' }}
                          >
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                          </div>
                        )}
                        <span
                          className="absolute top-0.5 left-0.5 rounded-md px-1 text-[11px] font-bold text-white"
                          style={{ background: 'rgba(0,0,0,0.55)' }}
                        >
                          {idx + 1}
                        </span>
                      </div>

                      {/* 입력 */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            list={isTeacher ? 'roster-names' : undefined}
                            value={it.artistName}
                            onChange={(e) => updateItem(it.id, { artistName: e.target.value })}
                            placeholder="작가 이름 *"
                            className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-sm outline-none"
                            style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                          />
                          <button
                            onClick={() => removeItem(it.id)}
                            className="shrink-0 w-7 rounded-lg text-sm"
                            style={{ background: 'var(--color-surface)', color: '#E8604C' }}
                          >
                            ✕
                          </button>
                        </div>
                        <input
                          type="text"
                          value={it.title}
                          onChange={(e) => updateItem(it.id, { title: e.target.value })}
                          placeholder="작품명 *"
                          className="rounded-lg px-2.5 py-1.5 text-sm outline-none"
                          style={{ background: 'var(--color-surface)', color: 'var(--color-text-main)' }}
                        />
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => updateItem(it.id, { type: it.type === 'flat' ? 'sculpture' : 'flat' })}
                            className="rounded-lg px-2 py-1 text-[12px] font-bold"
                            style={{ background: 'var(--color-surface)', color: 'var(--color-text-sub)' }}
                          >
                            {it.type === 'flat' ? '🖼️ 평면' : '🏺 입체'}
                          </button>
                          {it.enhancedUrl && (
                            <button
                              onClick={() => updateItem(it.id, { useEnhanced: !it.useEnhanced })}
                              className="rounded-lg px-2 py-1 text-[12px] font-bold"
                              style={{
                                background: it.useEnhanced ? 'var(--color-primary)' : 'var(--color-surface)',
                                color: it.useEnhanced ? 'white' : 'var(--color-text-sub)',
                              }}
                            >
                              {it.useEnhanced ? '✨ 보정본' : '원본'}
                            </button>
                          )}
                          {it.status === 'failed' && (
                            <span className="text-[12px]" style={{ color: '#C0392B' }}>보정 실패 · 원본 사용</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 명부 자동완성 데이터 */}
              {isTeacher && (
                <datalist id="roster-names">
                  {roster.map((n) => (
                    <option key={n} value={n} />
                  ))}
                </datalist>
              )}

              <button
                onClick={() => fileRef.current?.click()}
                className="w-full mt-2.5 rounded-xl py-2.5 text-sm font-bold border-2 border-dashed"
                style={{ borderColor: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
              >
                + 사진 더 추가
              </button>
            </>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple={isTeacher}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {/* 제출 */}
        {items.length > 0 && (
          <div className="px-5 pb-5 pt-2" style={{ borderTop: '1px solid var(--color-surface-soft)' }}>
            {!canSubmit && !uploading && (
              <p className="text-[12px] text-center mb-2" style={{ color: 'var(--color-text-sub)' }}>
                {stillEnhancing
                  ? '✨ AI 보정 중이에요...'
                  : `이름·작품명을 모두 채워주세요 (${readyCount}/${items.length})`}
              </p>
            )}
            <button
              onClick={handleSubmitAll}
              disabled={!canSubmit}
              className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
              style={{ background: 'var(--color-primary)' }}
            >
              {uploading
                ? `업로드 중... (${progress}/${items.length})`
                : isTeacher
                  ? `${items.length}점 바로 전시하기`
                  : `${items.length}점 제출하기`}
            </button>
            <p className="text-[12px] text-center mt-2" style={{ color: 'var(--color-text-sub)' }}>
              {isTeacher ? '선생님이 올린 작품은 바로 전시실에 걸려요' : '선생님 승인 후 전시실에 전시됩니다'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
