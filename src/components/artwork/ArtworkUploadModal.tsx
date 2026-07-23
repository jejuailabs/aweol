'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { resizeImage } from '@/lib/client-image';
import { doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { isTeacherOfClass } from '@/lib/auth-helpers';
import { scopeFromPath, visibilityOf } from '@/lib/exhibit-scope';
import { normalizeName, studentUidOf } from '@/lib/student-login';
import { youtubeId, youtubeThumb } from '@/lib/youtube';

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
  /** '사진' 과 '영상' 중 하나. 영상은 유튜브 주소만 받는다(우리가 저장하지 않는다). */
  const [mode, setMode] = useState<'photo' | 'video'>('photo');
  const [vUrl, setVUrl] = useState('');
  const [vTitle, setVTitle] = useState('');
  const [vArtist, setVArtist] = useState('');
  const [vErr, setVErr] = useState('');
  const vid = youtubeId(vUrl);

  // collectionPath: schools/{schoolId}/classes/{classId}/activities/{activityId}/artworks
  const { schoolId, classId, activityId } = scopeFromPath(collectionPath);

  /**
   * 이 전시실의 공개 범위. **작품에 베껴 넣어야 한다** — 전체 갤러리 조회는
   * 작품만 보고 걸러야 하는데(collectionGroup), 거기서는 전시실 문서를 못 본다.
   * 올릴 때 한 번 읽는다. 못 읽으면 학교 공개로 친다(숨기려던 것이 열리는 쪽보다
   * 열려 있던 것이 그대로인 쪽이 놀라움이 적다).
   */
  const [visibility, setVisibility] = useState<'school' | 'class'>('school');
  useEffect(() => {
    if (!db || !schoolId || !classId || !activityId) return;
    getDoc(doc(db, 'schools', schoolId, 'classes', classId, 'activities', activityId))
      .then((s) => setVisibility(visibilityOf(s.data()?.visibility)))
      .catch(() => {});
  }, [schoolId, classId, activityId]);

  /** 작품 문서에 함께 적는 소속. 규칙이 이걸 보고 갤러리 노출을 정한다. */
  const scopeFields = { schoolId, classId, visibility };

  /**
   * **이 반** 담임인가. 여기서 갈리는 게 명부·일괄도구만이 아니라
   * **바로 전시(승인 건너뛰기)** 라서 반을 반드시 봐야 한다.
   */
  const isTeacher = isTeacherOfClass(role, userDoc?.classIds, classId);

  /**
   * 교사용: 학급 명부를 불러온다. 이름 자동완성에도 쓰지만, **더 중요한 것은
   * 그 이름이 어느 아이인지 아는 것**이다.
   *
   * 선생님이 올린 작품에는 그동안 이름만 남았다(`artistUid` 가 빈 문자열). 그러면
   * 나중에 아이별로 모을 때 동명이인·개명·오타에 그대로 무너진다.
   * 이제 명부에서 고른 이름은 **그 아이의 uid 로 매단다** — 아이가 아직 한 번도
   * 로그인하지 않았어도 uid 는 명부 자리에서 정해지므로 미리 알 수 있다.
   */
  const [rosterRows, setRosterRows] = useState<{ id: string; name: string; linkedUid: string | null }[]>([]);
  useEffect(() => {
    if (!isTeacher || !db || !schoolId || !classId) return;
    (async () => {
      try {
        const snap = await getDocs(collection(db, 'schools', schoolId, 'classes', classId, 'students'));
        const rows = snap.docs
          .map((d) => ({
            id: d.id,
            number: (d.data().number as number) || 0,
            name: (d.data().name as string) || '',
            linkedUid: (d.data().linkedUid as string) || null,
          }))
          .filter((s) => s.name)
          .sort((a, b) => a.number - b.number);
        setRosterRows(rows);
        setRoster(rows.map((s) => s.name));
      } catch {
        setRosterRows([]);
        setRoster([]);
      }
    })();
  }, [isTeacher, schoolId, classId]);

  /**
   * 적힌 이름이 명부의 누구인지 찾아 uid 를 준다. 못 찾으면 빈 문자열 —
   * **억지로 매달지 않는다.** 명부에 없는 이름(전학생, 손님 작품)을 아무에게나
   * 붙이면 남의 작품이 그 아이 것이 된다.
   * 동명이인이면 누구인지 알 수 없으므로 역시 안 매단다.
   */
  const artistUidFor = (typedName: string): string => {
    const key = normalizeName(typedName);
    if (!key) return '';
    const hit = rosterRows.filter((s) => normalizeName(s.name) === key);
    if (hit.length !== 1) return '';
    return studentUidOf(schoolId, classId, hit[0]);
  };

  /**
   * 학생·학부모 본인 업로드면 이름을 대신 채워준다.
   *
   * 파일을 고를 때(`defaultName`) 이미 넣지만, 계정 정보가 늦게 오면 그때는 비어 있다.
   * 예전에는 effect 안에서 목록을 통째로 다시 써서 메웠는데, **그리는 중에 상태를
   * 고치는 것**이라 렌더가 연쇄된다. 어차피 이름이 필요한 순간은 낼 때뿐이라
   * 낼 때 메운다.
   */
  const nameFor = (typed: string) =>
    typed.trim() || (!isTeacher ? userDoc?.displayName || '' : '');

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
        artistName: nameFor(it.artistName),
        // 선생님이 올려도 **작품은 아이 것이다** — 명부에서 찾아 매단다
        artistUid: isTeacher ? artistUidFor(it.artistName) : user.uid,
        imageUrl,
        thumbnailUrl,
        type: it.type,
        artistComment: '',
        ...scopeFields,
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

  /**
   * 영상 작품 걸기.
   *
   * 액자에 걸 그림은 유튜브 썸네일 주소를 그대로 쓴다 — **Storage 를 안 쓴다.**
   * 그래서 영상 작품은 아무리 많이 올려도 저장 요금이 늘지 않는다.
   */
  const submitVideo = async () => {
    if (!db || !user || !vid || !vTitle.trim() || !vArtist.trim()) return;
    setUploading(true); setVErr('');
    try {
      const artworkId = `art-${Date.now()}`;
      const thumb = youtubeThumb(vid);
      await setDoc(doc(db, collectionPath, artworkId), {
        title: vTitle.trim(),
        artistName: nameFor(vArtist),
        artistUid: isTeacher ? artistUidFor(vArtist) : user.uid,
        imageUrl: thumb,
        thumbnailUrl: thumb,
        videoId: vid,
        type: 'flat',
        artistComment: '',
        ...scopeFields,
        uploadedBy: user.uid,
        uploadedByRole: isTeacher ? 'teacher' : role === 'parent' ? 'parent' : 'student',
        uploadedAt: serverTimestamp(),
        status: isTeacher ? 'approved' : 'pending',
        rejectionReason: null,
      });
      onUploaded();
      onClose();
    } catch {
      setVErr('작품을 올리지 못했어요. 내 반이 맞는지 확인하고 다시 해주세요.');
    } finally {
      setUploading(false);
    }
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
            🖼️ 작품 올리기 {mode === 'photo' && items.length > 0 && <span className="text-sm">({items.length}점)</span>}
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
          {/* 사진이냐 영상이냐 — 사진을 이미 고른 뒤에는 못 바꾼다(고른 게 날아가니까) */}
          {items.length === 0 && (
            <div className="flex gap-2 mb-4">
              {([['photo', '📷', '사진'], ['video', '▶️', '영상']] as const).map(([m, emoji, label]) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="flex-1 rounded-2xl py-3 text-[15px] font-black transition-transform active:scale-95"
                  style={
                    mode === m
                      ? { background: 'var(--color-primary)', color: 'white' }
                      : { background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }
                  }
                >
                  {emoji} {label}
                </button>
              ))}
            </div>
          )}

          {mode === 'video' ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-[14px] font-bold block mb-1.5" style={{ color: 'var(--color-text-sub)' }}>
                  유튜브 주소
                </label>
                <input
                  type="url"
                  inputMode="url"
                  value={vUrl}
                  onChange={(e) => setVUrl(e.target.value)}
                  placeholder="https://youtu.be/..."
                  className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none"
                  style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
                />
                {/* 붙여넣자마자 맞는지 보여준다 — 다 채우고 나서 틀렸다고 하면 늦다 */}
                {vUrl.trim() && !vid && (
                  <p className="text-[13px] font-bold mt-1.5" style={{ color: '#C0392B' }}>
                    유튜브 주소가 아니에요. 유튜브에서 &apos;공유&apos; 를 눌러 복사한 주소를 넣어주세요.
                  </p>
                )}
              </div>

              {vid && (
                <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={youtubeThumb(vid)} alt="" className="w-full aspect-video object-cover" />
                  <div className="px-3 py-2 text-[13px] font-bold" style={{ color: 'var(--color-text-sub)' }}>
                    ✅ 이 영상이 맞나요?
                  </div>
                </div>
              )}

              <input
                type="text"
                value={vTitle}
                onChange={(e) => setVTitle(e.target.value)}
                placeholder="작품명"
                className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
              <input
                type="text"
                list={roster.length > 0 ? 'video-roster' : undefined}
                value={vArtist}
                onChange={(e) => setVArtist(e.target.value)}
                placeholder="만든 사람 이름"
                className="w-full rounded-xl px-3.5 py-3 text-[15px] outline-none"
                style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-main)' }}
              />
              {roster.length > 0 && (
                <datalist id="video-roster">
                  {roster.map((n) => <option key={n} value={n} />)}
                </datalist>
              )}

              {vErr && (
                <div className="text-[14px] font-bold" style={{ color: '#C0392B' }}>⚠️ {vErr}</div>
              )}

              <button
                onClick={submitVideo}
                disabled={uploading || !vid || !vTitle.trim() || !vArtist.trim()}
                className="w-full rounded-xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
                style={{ background: 'var(--color-primary)' }}
              >
                {uploading ? '거는 중...' : isTeacher ? '바로 전시하기' : '제출하기'}
              </button>
              <p className="text-[13px] text-center" style={{ color: 'var(--color-text-sub)' }}>
                {isTeacher ? '선생님이 올린 작품은 바로 전시실에 걸려요' : '선생님 승인 후 전시실에 전시됩니다'}
              </p>
            </div>
          ) : items.length === 0 ? (
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
                  ? '여러 장을 한 번에 고를 수 있어요 · 책상 배경을 잘라내고 조명·선예도를 보정합니다'
                  : '책상 배경을 잘라내고 조명·선예도를 보정해요'}
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

        {/* 제출 — 사진만. 영상은 위에 자기 버튼이 있다. */}
        {mode === 'photo' && items.length > 0 && (
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
