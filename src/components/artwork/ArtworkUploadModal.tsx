'use client';

import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';

interface Props {
  collectionPath: string;
  onClose: () => void;
  onUploaded: () => void;
}

export default function ArtworkUploadModal({ collectionPath, onClose, onUploaded }: Props) {
  const { user, userDoc, role } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [originalUrl, setOriginalUrl] = useState<string>('');
  const [enhancedBlob, setEnhancedBlob] = useState<Blob | null>(null);
  const [enhancedUrl, setEnhancedUrl] = useState<string>('');
  const [enhancing, setEnhancing] = useState(false);
  const [enhanceFailed, setEnhanceFailed] = useState(false);
  const [useEnhanced, setUseEnhanced] = useState(true);
  const [title, setTitle] = useState('');
  const [artistName, setArtistName] = useState('');
  const [comment, setComment] = useState('');
  const [type, setType] = useState<'flat' | 'sculpture'>('flat');
  const [uploading, setUploading] = useState(false);

  const isTeacher = canManageClass(role);

  // 학생 본인 업로드면 작가명 자동 채움 (수정 가능)
  useEffect(() => {
    if (!isTeacher && userDoc?.displayName) {
      setArtistName(userDoc.displayName);
    }
  }, [isTeacher, userDoc]);

  useEffect(() => {
    return () => {
      if (originalUrl) URL.revokeObjectURL(originalUrl);
      if (enhancedUrl) URL.revokeObjectURL(enhancedUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setEnhancedBlob(null);
    setEnhancedUrl('');
    setEnhanceFailed(false);
    setUseEnhanced(true);
    if (originalUrl) URL.revokeObjectURL(originalUrl);
    setOriginalUrl(URL.createObjectURL(f));

    // AI 보정 요청 (원본 비파괴 — 선예도/조명/색만 복원)
    setEnhancing(true);
    try {
      const fd = new FormData();
      fd.append('image', f);
      const res = await fetch('/api/enhance', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('enhance failed');
      const blob = await res.blob();
      setEnhancedBlob(blob);
      setEnhancedUrl(URL.createObjectURL(blob));
    } catch {
      setEnhanceFailed(true);
      setUseEnhanced(false);
    }
    setEnhancing(false);
  };

  const handleSubmit = async () => {
    if (!file || !title.trim() || !artistName.trim() || !db || !storage || !user) return;
    setUploading(true);

    const uploadBlob = useEnhanced && enhancedBlob ? enhancedBlob : file;
    const artworkId = `art-${Date.now()}`;
    const ext = useEnhanced && enhancedBlob ? 'jpg' : (file.name.split('.').pop() || 'jpg');
    const storagePath = `artworks/${user.uid}/${artworkId}.${ext}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, uploadBlob);
    const imageUrl = await getDownloadURL(storageRef);

    await setDoc(doc(db, collectionPath, artworkId), {
      title: title.trim(),
      artistName: artistName.trim(),
      artistUid: isTeacher ? '' : user.uid,
      imageUrl,
      thumbnailUrl: imageUrl,
      type,
      artistComment: comment.trim(),
      uploadedBy: user.uid,
      uploadedByRole: isTeacher ? 'teacher' : role === 'parent' ? 'parent' : 'student',
      uploadedAt: serverTimestamp(),
      // 교사가 직접 올리면 즉시 전시 (본인이 승인권자이므로)
      status: isTeacher ? 'approved' : 'pending',
      rejectionReason: null,
    });

    setUploading(false);
    onUploaded();
    onClose();
  };

  const shownUrl = useEnhanced && enhancedUrl ? enhancedUrl : originalUrl;

  return (
    <div
      className="absolute inset-0 z-50 flex items-end sm:items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="modal-card w-full max-w-[520px] rounded-t-3xl sm:rounded-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '88vh' }}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-surface-soft)' }} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4 pt-2 sm:pt-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>
              🖼️ 작품 올리기
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              ✕
            </button>
          </div>

          {/* 사진 + AI 보정 */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-[4/3] rounded-2xl mb-2 flex flex-col items-center justify-center gap-2 border-2 border-dashed transition-colors relative overflow-hidden"
            style={{
              borderColor: shownUrl ? 'transparent' : 'var(--color-surface-soft)',
              background: shownUrl ? '#F3F1EC' : 'var(--color-surface-soft)',
            }}
          >
            {shownUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={shownUrl} alt="미리보기" className="w-full h-full object-contain" />
            ) : (
              <>
                <span className="text-4xl">📷</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-sub)' }}>
                  작품 사진을 선택하세요
                </span>
                <span className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
                  올리면 AI가 선예도·조명을 자동 보정해요
                </span>
              </>
            )}
            {enhancing && (
              <div
                className="absolute inset-0 flex flex-col items-center justify-center gap-2"
                style={{ background: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(2px)' }}
              >
                <div className="h-7 w-7 animate-spin rounded-full border-[3px] border-[var(--color-primary)] border-t-transparent" />
                <span className="text-xs font-bold" style={{ color: 'var(--color-text-main)' }}>
                  ✨ AI 보정 중...
                </span>
              </div>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* 보정 전/후 토글 */}
          {file && enhancedUrl && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <button
                onClick={() => setUseEnhanced(false)}
                className="rounded-full px-4 py-1.5 text-[11px] font-bold transition-all"
                style={{
                  background: !useEnhanced ? 'var(--color-text-main)' : 'var(--color-surface-soft)',
                  color: !useEnhanced ? 'white' : 'var(--color-text-sub)',
                }}
              >
                원본
              </button>
              <button
                onClick={() => setUseEnhanced(true)}
                className="rounded-full px-4 py-1.5 text-[11px] font-bold transition-all"
                style={{
                  background: useEnhanced ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                  color: useEnhanced ? 'white' : 'var(--color-text-sub)',
                }}
              >
                ✨ AI 보정본
              </button>
              <span className="text-[10px]" style={{ color: 'var(--color-text-sub)' }}>
                {useEnhanced ? '보정본으로 전시돼요' : '원본 그대로 전시돼요'}
              </span>
            </div>
          )}
          {enhanceFailed && file && (
            <p className="text-[10px] text-center mb-3" style={{ color: '#C0392B' }}>
              보정에 실패해서 원본으로 올라가요
            </p>
          )}

          {/* 작가 이름 — 작품 하나당 필수 */}
          <div className="mb-3">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text-sub)' }}>
              작가 이름 *
            </label>
            <input
              type="text"
              value={artistName}
              onChange={(e) => setArtistName(e.target.value)}
              placeholder={isTeacher ? '작품을 만든 학생 이름 (예: 김하늘)' : '이름을 입력하세요'}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>

          {/* 작품명 */}
          <div className="mb-3">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text-sub)' }}>
              작품명 *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="예: 봄날의 꽃밭"
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>

          {/* 작품 유형 */}
          <div className="mb-3">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text-sub)' }}>
              작품 유형
            </label>
            <div className="flex gap-2">
              {(['flat', 'sculpture'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className="flex-1 rounded-xl py-2.5 text-sm font-bold transition-all"
                  style={{
                    background: type === t ? 'var(--color-primary)' : 'var(--color-surface-soft)',
                    color: type === t ? 'white' : 'var(--color-text-sub)',
                  }}
                >
                  {t === 'flat' ? '🖼️ 평면 작품' : '🏺 입체 작품'}
                </button>
              ))}
            </div>
          </div>

          {/* 작가의 말 */}
          <div className="mb-4">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text-sub)' }}>
              작가의 말 (선택)
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="이 작품에 대해 이야기해주세요"
              rows={2}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || !artistName.trim() || uploading || enhancing}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {uploading ? '업로드 중...' : enhancing ? 'AI 보정 중...' : isTeacher ? '바로 전시하기' : '작품 제출하기'}
          </button>
          <p className="text-[10px] text-center mt-2" style={{ color: 'var(--color-text-sub)' }}>
            {isTeacher ? '선생님이 올린 작품은 바로 전시실에 걸려요' : '선생님 승인 후 전시실에 전시됩니다'}
          </p>
        </div>
      </div>
    </div>
  );
}
