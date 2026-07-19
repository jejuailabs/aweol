'use client';

import { useState, useRef } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

interface Props {
  collectionPath: string;
  onClose: () => void;
  onUploaded: () => void;
}

export default function ArtworkUploadModal({ collectionPath, onClose, onUploaded }: Props) {
  const { user, userDoc, role } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [type, setType] = useState<'flat' | 'sculpture'>('flat');
  const [uploading, setUploading] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const handleSubmit = async () => {
    if (!file || !title.trim() || !db || !storage || !user || !userDoc) return;
    setUploading(true);

    const artworkId = `art-${Date.now()}`;
    const storagePath = `artworks/${artworkId}/${file.name}`;
    const storageRef = ref(storage, storagePath);

    await uploadBytes(storageRef, file);
    const imageUrl = await getDownloadURL(storageRef);

    await setDoc(doc(db, collectionPath, artworkId), {
      title: title.trim(),
      artistName: userDoc.displayName || '익명',
      artistUid: user.uid,
      imageUrl,
      thumbnailUrl: imageUrl,
      type,
      artistComment: comment.trim(),
      uploadedBy: user.uid,
      uploadedByRole: role === 'parent' ? 'parent' : 'student',
      uploadedAt: serverTimestamp(),
      status: 'pending',
      rejectionReason: null,
    });

    setUploading(false);
    onUploaded();
    onClose();
  };

  return (
    <div
      className="absolute inset-0 z-50 flex items-end justify-center"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="w-full max-w-[480px] rounded-t-3xl shadow-2xl flex flex-col"
        style={{ background: 'var(--color-surface)', maxHeight: '80vh' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--color-surface-soft)' }} />
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-4">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-lg font-bold" style={{ color: 'var(--color-text-main)' }}>
              작품 올리기
            </h3>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-sm"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
            >
              ✕
            </button>
          </div>

          {/* 이미지 업로드 */}
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-[4/3] rounded-2xl mb-4 flex flex-col items-center justify-center gap-2 border-2 border-dashed transition-colors"
            style={{
              borderColor: preview ? 'transparent' : 'var(--color-surface-soft)',
              background: preview ? 'transparent' : 'var(--color-surface-soft)',
              overflow: 'hidden',
            }}
          >
            {preview ? (
              <img src={preview} alt="미리보기" className="w-full h-full object-contain" />
            ) : (
              <>
                <span className="text-4xl">📷</span>
                <span className="text-sm font-bold" style={{ color: 'var(--color-text-sub)' }}>
                  작품 사진을 선택하세요
                </span>
              </>
            )}
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

          {/* 제목 */}
          <div className="mb-3">
            <label className="text-xs font-bold mb-1 block" style={{ color: 'var(--color-text-sub)' }}>
              작품 제목
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="나의 멋진 작품"
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
              rows={3}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none resize-none"
              style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
            />
          </div>
        </div>

        {/* 제출 버튼 */}
        <div className="px-5 pb-5 pt-2">
          <button
            onClick={handleSubmit}
            disabled={!file || !title.trim() || uploading}
            className="w-full rounded-xl py-3.5 text-sm font-bold text-white transition-opacity disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {uploading ? '업로드 중...' : '작품 제출하기'}
          </button>
          <p className="text-[10px] text-center mt-2" style={{ color: 'var(--color-text-sub)' }}>
            선생님 승인 후 전시실에 전시됩니다
          </p>
        </div>
      </div>
    </div>
  );
}
