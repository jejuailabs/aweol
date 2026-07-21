'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query,
  serverTimestamp, updateDoc, where,
} from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import type { SchoolProfile } from '@/lib/firestore-schema';

type Tab = 'about' | 'meal' | 'notice' | 'suggest' | 'album';

const TABS: { key: Tab; label: string; emoji: string }[] = [
  { key: 'about', label: '학교 소개', emoji: '🏫' },
  // 급식은 전 학년이 같아서 반 알림판이 아니라 여기 있다
  { key: 'meal', label: '오늘 급식', emoji: '🍚' },
  { key: 'notice', label: '공지', emoji: '📢' },
  { key: 'suggest', label: '건의함', emoji: '💌' },
  { key: 'album', label: '앨범', emoji: '🖼️' },
];

interface HallNotice {
  id: string; title: string; body: string; authorName: string;
}
interface Suggestion {
  id: string; body: string; authorName: string; authorUid: string; reply: string | null;
}
interface AlbumItem {
  id: string; title: string; artistName: string; thumbnailUrl: string;
}

/**
 * 학교 현관에 들어왔을 때 뜨는 창.
 *
 * 반 교실이 '우리 반'이라면 여기는 '우리 학교'다.
 * 학교 상징은 관리자 화면에서 채운 것을 그대로 읽어 보여준다 —
 * 여기서 또 입력받으면 같은 값이 두 군데 생긴다.
 */
export default function SchoolHallModal({
  schoolId, schoolName, profile, emblemUrl, initialTab = 'about', onClose,
}: {
  schoolId: string;
  schoolName: string;
  profile?: SchoolProfile;
  emblemUrl?: string;
  /** 로비에서 어느 게시판을 눌렀는지. 그 칸이 열린 채로 뜬다 */
  initialTab?: Tab;
  onClose: () => void;
}) {
  const { user, userDoc } = useAuth();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [notices, setNotices] = useState<HallNotice[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [album, setAlbum] = useState<AlbumItem[]>([]);
  const [loaded, setLoaded] = useState<Record<Tab, boolean>>({
    about: true, meal: false, notice: false, suggest: false, album: false,
  });
  const [meal, setMeal] = useState<{ dishes: string[]; kcal: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  // 글쓰기
  const [nTitle, setNTitle] = useState('');
  const [nBody, setNBody] = useState('');
  const [sBody, setSBody] = useState('');

  const pressedBackdrop = useRef(false);

  const isStaff = userDoc?.role === 'teacher' || userDoc?.role === 'super_admin';
  const canWriteNotice = isStaff && (userDoc?.schoolIds ?? []).includes(schoolId);
  const canManageAll = userDoc?.role === 'super_admin' || canWriteNotice;

  /**
   * 급식은 서버가 하루에 한 번만 NEIS 를 부르고 학교 문서에 얹어둔다.
   * 아이가 볼 때마다 남의 서버를 두드리지 않는다.
   */
  const loadMeal = useCallback(async () => {
    const token = await auth?.currentUser?.getIdToken();
    const res = await fetch(`/api/meal?schoolId=${encodeURIComponent(schoolId)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const j = await res.json().catch(() => ({}));
    setMeal({ dishes: j.dishes ?? [], kcal: j.kcal ?? '' });
  }, [schoolId]);

  const loadNotices = useCallback(async () => {
    if (!db) return;
    const snap = await getDocs(query(
      collection(db, 'schools', schoolId, 'hallNotices'),
      orderBy('createdAt', 'desc'), limit(20)
    ));
    setNotices(snap.docs.map((d) => ({ id: d.id, ...d.data() } as HallNotice)));
  }, [schoolId]);

  const loadSuggestions = useCallback(async () => {
    if (!db || !user) return;
    /**
     * 건의는 공개가 아니다. 교직원은 전부, 아이는 자기 것만 본다.
     * 규칙이 막고 있어서, 아이가 전체 조회를 하면 그냥 실패한다 — 질의부터 갈라야 한다.
     */
    const base = collection(db, 'schools', schoolId, 'suggestions');
    const q = canManageAll
      ? query(base, orderBy('createdAt', 'desc'), limit(50))
      : query(base, where('authorUid', '==', user.uid), limit(20));
    const snap = await getDocs(q);
    setSuggestions(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Suggestion)));
  }, [schoolId, user, canManageAll]);

  const loadAlbum = useCallback(async () => {
    if (!db) return;
    /**
     * 학교 앨범은 이미 올라온 작품의 **썸네일**을 모아 보여준다.
     * 사진을 따로 올리게 하면 저장 용량이 또 늘어난다 — 이미 있는 걸 쓴다.
     *
     * 다만 작품에는 schoolId 가 없어서 경로로 걸러낸다. 학교가 많아지면
     * 남의 학교 작품까지 읽고 버리는 셈이라, 그때는 작품에 schoolId 를 심어야 한다.
     * (지금은 전체가 수십 건이라 limit 로 묶어두는 편이 간단하다)
     */
    const snap = await getDocs(query(
      collection(db, 'schools', schoolId, 'classes'), where('isArchived', '==', false), limit(60)
    ));
    const items: AlbumItem[] = [];
    for (const c of snap.docs) {
      const arts = await getDocs(query(
        collection(db, 'schools', schoolId, 'classes', c.id, 'artworks'),
        where('status', '==', 'approved'), limit(6)
      ));
      arts.forEach((a) => {
        const v = a.data();
        items.push({
          id: a.id,
          title: (v.title as string) || '',
          artistName: (v.artistName as string) || '',
          thumbnailUrl: (v.thumbnailUrl as string) || (v.imageUrl as string) || '',
        });
      });
      if (items.length >= 24) break;
    }
    setAlbum(items.slice(0, 24));
  }, [schoolId]);

  useEffect(() => {
    if (loaded[tab]) return;
    setErr('');
    const run = tab === 'meal' ? loadMeal
      : tab === 'notice' ? loadNotices
        : tab === 'suggest' ? loadSuggestions
          : tab === 'album' ? loadAlbum : null;
    if (!run) return;
    setBusy(true);
    run()
      .then(() => setLoaded((p) => ({ ...p, [tab]: true })))
      .catch((e) => setErr(String(e).slice(0, 80)))
      .finally(() => setBusy(false));
  }, [tab, loaded, loadMeal, loadNotices, loadSuggestions, loadAlbum]);

  const addNotice = async () => {
    if (!db || !user || !nTitle.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'schools', schoolId, 'hallNotices'), {
        title: nTitle.trim().slice(0, 60),
        body: nBody.trim().slice(0, 600),
        authorUid: user.uid,
        authorName: userDoc?.displayName || '선생님',
        createdAt: serverTimestamp(),
      });
      setNTitle(''); setNBody('');
      await loadNotices();
      playSound('success');
    } catch (e) { setErr(String(e).slice(0, 80)); playSound('error'); }
    setBusy(false);
  };

  const addSuggestion = async () => {
    if (!db || !user || !sBody.trim()) return;
    setBusy(true);
    try {
      await addDoc(collection(db, 'schools', schoolId, 'suggestions'), {
        body: sBody.trim().slice(0, 500),
        authorUid: user.uid,
        authorName: userDoc?.displayName || '익명',
        reply: null,
        repliedBy: null,
        createdAt: serverTimestamp(),
      });
      setSBody('');
      await loadSuggestions();
      playSound('success');
    } catch (e) { setErr(String(e).slice(0, 80)); playSound('error'); }
    setBusy(false);
  };

  const reply = async (id: string, text: string) => {
    if (!db || !user || !text.trim()) return;
    await updateDoc(doc(db, 'schools', schoolId, 'suggestions', id), {
      reply: text.trim().slice(0, 500), repliedBy: user.uid,
    });
    await loadSuggestions();
  };

  const remove = async (id: string) => {
    if (!db) return;
    await deleteDoc(doc(db, 'schools', schoolId, 'suggestions', id));
    await loadSuggestions();
  };

  const hasProfile = profile && (profile.founded || profile.motto || profile.flower || profile.tree || profile.note);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-center justify-center px-4 py-6"
      style={{ background: 'rgba(24,20,16,0.55)', backdropFilter: 'blur(6px)' }}
      onPointerDown={(e) => { pressedBackdrop.current = e.target === e.currentTarget; }}
      onClick={(e) => {
        if (e.target !== e.currentTarget || !pressedBackdrop.current) return;
        pressedBackdrop.current = false;
        if (busy) return;
        onClose();
      }}
    >
      <div
        className="w-full max-w-[520px] rounded-[28px] overflow-hidden flex flex-col"
        style={{ maxHeight: '88vh', background: 'rgba(255,250,240,0.97)', border: '3px solid rgba(255,255,255,0.7)' }}
      >
        {/* 머리 */}
        <div className="px-5 pt-4 pb-3 flex items-center gap-3" style={{ background: 'linear-gradient(135deg, #8FD98Add, #6AB56599)' }}>
          {emblemUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={emblemUrl} alt="" className="h-11 w-11 rounded-full object-cover shrink-0" style={{ border: '2px solid rgba(255,255,255,0.8)' }} />
          )}
          <div className="min-w-0">
            <div className="text-base font-black text-white truncate">{schoolName}</div>
            <div className="text-[12px] text-white opacity-80">현관에 들어왔어요</div>
          </div>
          <button
            onClick={onClose}
            className="ml-auto h-8 w-8 rounded-full text-sm shrink-0"
            style={{ background: 'rgba(255,255,255,0.3)', color: 'white' }}
          >
            ✕
          </button>
        </div>

        {/* 탭 */}
        <div className="flex px-3 pt-3 gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="flex-1 rounded-xl py-2 text-[13px] font-bold transition-all"
              style={{
                background: tab === t.key ? 'var(--color-primary)' : 'white',
                color: tab === t.key ? 'white' : '#8A7A5F',
              }}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {err && <div className="text-[13px] font-bold mb-2" style={{ color: '#C0392B' }}>{err}</div>}
          {busy && <div className="text-[13px] mb-2" style={{ color: '#A89880' }}>불러오는 중...</div>}

          {/* ---- 학교 소개 ---- */}
          {tab === 'about' && (
            hasProfile ? (
              <div className="flex flex-col gap-2.5">
                {profile!.note && (
                  <div className="rounded-2xl px-4 py-3 text-sm leading-relaxed" style={{ background: 'white', color: '#3A3226' }}>
                    {profile!.note}
                  </div>
                )}
                {([
                  ['🎂', '개교', profile!.founded ? `${profile!.founded}년` : ''],
                  ['📜', '교훈', profile!.motto],
                  ['🌸', '교화', profile!.flower],
                  ['🌳', '교목', profile!.tree],
                ] as [string, string, string][])
                  .filter(([, , v]) => v)
                  .map(([emoji, label, v]) => (
                    <div key={label} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: 'white' }}>
                      <span className="text-lg">{emoji}</span>
                      <span className="text-[13px] font-bold shrink-0" style={{ color: '#A89880' }}>{label}</span>
                      <span className="text-sm ml-auto text-right" style={{ color: '#3A3226' }}>{v}</span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8 text-[14px] leading-relaxed" style={{ color: '#A89880' }}>
                아직 학교 소개가 없어요.<br />
                선생님이 관리자 화면에서 채워주시면 여기에 보여요.
              </div>
            )
          )}

          {/* ---- 오늘 급식 ---- */}
          {tab === 'meal' && (
            meal && meal.dishes.length > 0 ? (
              <div>
                <div className="flex flex-col gap-2">
                  {meal.dishes.map((d, i) => (
                    <div
                      key={i}
                      className="rounded-2xl px-4 py-3 text-[15px] font-bold"
                      style={{ background: 'white', color: '#3A3226' }}
                    >
                      🍽️ {d}
                    </div>
                  ))}
                </div>
                {meal.kcal && (
                  <div className="text-[14px] mt-3 text-center" style={{ color: '#A89880' }}>
                    {meal.kcal}
                  </div>
                )}
              </div>
            ) : !busy ? (
              <div className="text-center py-8 text-[15px] leading-relaxed" style={{ color: '#A89880' }}>
                오늘은 급식 정보가 없어요.<br />
                주말이나 방학일 수 있어요.
              </div>
            ) : null
          )}

          {/* ---- 공지 ---- */}
          {tab === 'notice' && (
            <div className="flex flex-col gap-2.5">
              {canWriteNotice && (
                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: 'white' }}>
                  <input
                    value={nTitle}
                    onChange={(e) => setNTitle(e.target.value)}
                    placeholder="공지 제목"
                    className="rounded-xl px-3 py-2 text-sm outline-none"
                    style={{ background: '#F7F2E8', color: '#3A3226' }}
                  />
                  <textarea
                    value={nBody}
                    onChange={(e) => setNBody(e.target.value)}
                    rows={2}
                    placeholder="내용"
                    className="rounded-xl px-3 py-2 text-sm outline-none resize-none"
                    style={{ background: '#F7F2E8', color: '#3A3226' }}
                  />
                  <button
                    onClick={addNotice}
                    disabled={busy || !nTitle.trim()}
                    className="rounded-xl py-2 text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    공지 올리기
                  </button>
                </div>
              )}
              {notices.length === 0 && !busy && (
                <div className="text-center py-8 text-[14px]" style={{ color: '#A89880' }}>아직 공지가 없어요</div>
              )}
              {notices.map((n) => (
                <div key={n.id} className="rounded-2xl px-4 py-3" style={{ background: 'white' }}>
                  <div className="text-sm font-bold mb-1" style={{ color: '#3A3226' }}>📢 {n.title}</div>
                  {n.body && <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#5A4F3F' }}>{n.body}</div>}
                  <div className="text-[12px] mt-1.5" style={{ color: '#A89880' }}>{n.authorName}</div>
                </div>
              ))}
            </div>
          )}

          {/* ---- 건의함 ---- */}
          {tab === 'suggest' && (
            <div className="flex flex-col gap-2.5">
              <div className="text-[12px] leading-relaxed" style={{ color: '#A89880' }}>
                건의는 <b>선생님과 나만</b> 볼 수 있어요. 다른 친구에게는 안 보여요.
              </div>
              {user && (
                <div className="rounded-2xl p-3 flex flex-col gap-2" style={{ background: 'white' }}>
                  <textarea
                    value={sBody}
                    onChange={(e) => setSBody(e.target.value)}
                    rows={3}
                    placeholder="학교에 하고 싶은 말을 적어주세요"
                    className="rounded-xl px-3 py-2 text-sm outline-none resize-none"
                    style={{ background: '#F7F2E8', color: '#3A3226' }}
                  />
                  <button
                    onClick={addSuggestion}
                    disabled={busy || !sBody.trim()}
                    className="rounded-xl py-2 text-sm font-bold text-white disabled:opacity-40"
                    style={{ background: 'var(--color-primary)' }}
                  >
                    건의 보내기
                  </button>
                </div>
              )}
              {suggestions.length === 0 && !busy && (
                <div className="text-center py-6 text-[14px]" style={{ color: '#A89880' }}>아직 건의가 없어요</div>
              )}
              {suggestions.map((s) => (
                <SuggestionCard
                  key={s.id}
                  item={s}
                  canReply={canManageAll}
                  canDelete={canManageAll || s.authorUid === user?.uid}
                  onReply={(t) => reply(s.id, t)}
                  onDelete={() => remove(s.id)}
                />
              ))}
            </div>
          )}

          {/* ---- 앨범 ---- */}
          {tab === 'album' && (
            album.length === 0 && !busy ? (
              <div className="text-center py-8 text-[14px]" style={{ color: '#A89880' }}>
                아직 전시된 작품이 없어요
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {album.map((a) => (
                  <div key={a.id} className="rounded-xl overflow-hidden" style={{ background: 'white' }}>
                    <div className="aspect-square">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.thumbnailUrl} alt={a.title} className="h-full w-full object-cover" />
                    </div>
                    <div className="px-1.5 py-1">
                      <div className="text-[12px] font-bold truncate" style={{ color: '#3A3226' }}>{a.title}</div>
                      <div className="text-[11px] truncate" style={{ color: '#A89880' }}>{a.artistName}</div>
                    </div>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

function SuggestionCard({
  item, canReply, canDelete, onReply, onDelete,
}: {
  item: Suggestion;
  canReply: boolean;
  canDelete: boolean;
  onReply: (text: string) => void;
  onDelete: () => void;
}) {
  const [text, setText] = useState('');
  return (
    <div className="rounded-2xl px-4 py-3" style={{ background: 'white' }}>
      <div className="text-[15px] leading-relaxed whitespace-pre-wrap" style={{ color: '#3A3226' }}>{item.body}</div>
      <div className="flex items-center gap-2 mt-1.5">
        <span className="text-[12px]" style={{ color: '#A89880' }}>{item.authorName}</span>
        {canDelete && (
          <button onClick={onDelete} className="ml-auto text-[12px] underline" style={{ color: '#C0392B' }}>
            지우기
          </button>
        )}
      </div>
      {item.reply ? (
        <div className="mt-2 rounded-xl px-3 py-2 text-[14px] leading-relaxed" style={{ background: '#EAF7EA', color: '#3A5B3A' }}>
          💬 {item.reply}
        </div>
      ) : canReply ? (
        <div className="mt-2 flex gap-1.5">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="답변 달기"
            className="flex-1 min-w-0 rounded-xl px-3 py-1.5 text-[14px] outline-none"
            style={{ background: '#F7F2E8', color: '#3A3226' }}
          />
          <button
            onClick={() => { onReply(text); setText(''); }}
            disabled={!text.trim()}
            className="shrink-0 rounded-xl px-3 text-[13px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            등록
          </button>
        </div>
      ) : null}
    </div>
  );
}
