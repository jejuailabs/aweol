'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { playSound } from '@/lib/sound';
import { siteById } from '@/lib/local-sites';

/**
 * 우리 고장 유적 — 읽고, 보고, 돌아간다.
 *
 * **3D 방을 만들지 않았다.** 기관은 '들어가서 사람을 만나는' 곳이라 방이 필요했지만,
 * 유적은 **읽고 보는** 곳이다. 성벽을 어설프게 3D 로 세우면 실제와 달라서
 * 오히려 잘못 배운다 — 대신 남아 있는 것을 글과 영상으로 정확히 전한다.
 *
 * **영상을 끝까지 봐야 심부름이 끝난다.** 넘겨버리면 안 본 것이다.
 */

/** 유튜브가 알려주는 상태값 중 '끝났다' */
const YT_ENDED = 0;

export default function LocalSitePage() {
  const router = useRouter();
  const params = useParams();
  const schoolId = String(params.schoolId ?? '');
  const siteId = String(params.siteId ?? '');
  const { user } = useAuth();

  const site = siteById(siteId);

  const [page, setPage] = useState(0);
  /** 영상을 끝까지 봤나 */
  const [watched, setWatched] = useState(false);
  const [done, setDone] = useState(false);
  const playerRef = useRef<HTMLDivElement>(null);

  const questId = `site-${siteId}`;

  useEffect(() => {
    if (!db || !user || !siteId) return;
    getDoc(doc(db, 'users', user.uid, 'quests', questId))
      .then((s) => {
        if (s.exists() && s.data()?.done === true) { setDone(true); setWatched(true); }
      })
      .catch(() => {});
  }, [user, siteId, questId]);

  /**
   * 유튜브 플레이어 — **끝까지 봤는지 알아야** 하므로 그냥 iframe 이 아니라
   * IFrame API 로 띄운다. 그래야 '영상이 끝났다'를 받을 수 있다.
   *
   * `youtube-nocookie` 를 쓴다 — 아이들 화면이라 추적 쿠키를 덜 심는다
   * (작품 영상에서 이미 정한 것과 같다).
   */
  useEffect(() => {
    if (!site?.videoId || !playerRef.current) return;

    let player: { destroy?: () => void } | null = null;
    let cancelled = false;

    const make = () => {
      if (cancelled || !playerRef.current) return;
      const YT = (window as unknown as { YT?: { Player: new (el: HTMLElement, o: unknown) => { destroy?: () => void } } }).YT;
      if (!YT?.Player) return;
      player = new YT.Player(playerRef.current, {
        videoId: site.videoId,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onStateChange: (e: { data: number }) => {
            if (e.data === YT_ENDED) { setWatched(true); playSound('success'); }
          },
        },
      });
    };

    const w = window as unknown as { YT?: unknown; onYouTubeIframeAPIReady?: () => void };
    if (w.YT) {
      make();
    } else {
      // 스크립트를 한 번만 넣는다 — 여러 번 넣으면 콜백이 겹친다
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.body.appendChild(s);
      }
      const prev = w.onYouTubeIframeAPIReady;
      w.onYouTubeIframeAPIReady = () => { prev?.(); make(); };
    }

    return () => { cancelled = true; player?.destroy?.(); };
  }, [site?.videoId]);

  const finish = () => {
    setDone(true);
    playSound('success');
    if (!db || !user) return;
    setDoc(
      doc(db, 'users', user.uid, 'quests', questId),
      { done: true, siteId, at: serverTimestamp() },
      { merge: true }
    ).catch(() => {});
  };

  if (!site) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <span className="text-5xl">🗿</span>
        <p className="text-sm" style={{ color: 'var(--color-text-sub)' }}>
          아직 볼 수 없는 곳이에요
        </p>
        <button
          onClick={() => router.push('/village')}
          className="rounded-full px-6 py-2.5 text-sm font-bold text-white"
          style={{ background: 'var(--color-primary)' }}
        >
          마을로 돌아가기
        </button>
      </div>
    );
  }

  const p = site.pages[page];
  const last = page >= site.pages.length - 1;

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[560px]">
      <div className="flex items-center gap-2 mb-4">
        <button onClick={() => router.push('/village')} className="ac-btn px-3.5 py-2 text-sm">
          ← 마을로
        </button>
        <h1 className="text-lg font-black" style={{ color: 'var(--color-text-main)' }}>
          {site.emoji} {site.name}
        </h1>
      </div>

      <p className="text-[14px] mb-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        {site.oneLine}
      </p>

      {/* 읽기 — 한 장에 한 가지 */}
      <div className="rounded-3xl p-5" style={{ background: '#FFFAF0' }}>
        <div className="flex items-center mb-2">
          <span className="text-[17px] font-black" style={{ color: '#3A3226' }}>{p.title}</span>
          <span className="ml-auto text-[12px] font-bold" style={{ color: '#A89880' }}>
            {page + 1} / {site.pages.length}
          </span>
        </div>
        <div
          className="text-[14px] leading-relaxed whitespace-pre-line"
          style={{ color: '#5B4A3B', minHeight: '120px' }}
        >
          {p.body.split(/\*\*(.+?)\*\*/g).map((part, i) =>
            i % 2 === 1 ? <b key={i} style={{ color: '#3A3226' }}>{part}</b> : <span key={i}>{part}</span>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setPage((v) => Math.max(0, v - 1))}
            disabled={page === 0}
            className="h-11 w-11 rounded-full text-[18px] font-black disabled:opacity-30"
            style={{ background: '#F0E6D2', color: '#6B5B43' }}
          >
            ‹
          </button>
          <button
            onClick={() => setPage((v) => Math.min(site.pages.length - 1, v + 1))}
            disabled={last}
            className="flex-1 rounded-full py-3 text-[15px] font-bold text-white disabled:opacity-40"
            style={{ background: 'var(--color-primary)' }}
          >
            {last ? '다 읽었어요' : '다음 ›'}
          </button>
        </div>
      </div>

      {/* 영상 */}
      {site.videoId && (
        <div className="mt-5">
          <div className="text-[14px] font-black mb-2" style={{ color: 'var(--color-text-main)' }}>
            🎬 영상으로 보기
          </div>
          <div className="w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '16 / 9', background: '#000' }}>
            <div ref={playerRef} className="w-full h-full" />
          </div>
          <p className="text-[12px] mt-2 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
            {watched
              ? '✅ 영상을 다 봤어요!'
              : '영상을 끝까지 보면 심부름이 끝나요.'}
          </p>
        </div>
      )}

      {/* 심부름 마치기 */}
      <button
        onClick={finish}
        disabled={!watched || done}
        className="w-full mt-4 rounded-2xl py-3.5 text-[15px] font-bold text-white disabled:opacity-40"
        style={{ background: done ? '#8A7A5F' : '#3BAF9F' }}
      >
        {done ? '✓ 이미 알아봤어요' : watched ? '✓ 다 알아봤어요' : '영상을 끝까지 봐야 해요'}
      </button>

      {done && (
        <div className="rounded-2xl p-4 mt-3 text-center" style={{ background: '#EAF6EF' }}>
          <div className="text-[13px] mb-2" style={{ color: '#3A3226' }}>
            읍사무소로 돌아가서 알려주면 돼요.
          </div>
          <button
            onClick={() => router.push(`/school/${schoolId}/place/townhall`)}
            className="w-full rounded-xl py-3 text-[14px] font-bold text-white"
            style={{ background: 'var(--color-primary)' }}
          >
            🏛️ 읍사무소로 가기
          </button>
        </div>
      )}

      {/*
        **출처를 보여준다.** 지어낸 이야기가 아니라는 것을 아이도 선생님도
        확인할 수 있어야 한다. 고장 역사는 특히 그렇다.
      */}
      <div className="mt-6 text-[12px] leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        <b>이 이야기는 어디서 왔나요?</b>
        <ul className="mt-1 list-disc pl-4">
          {site.sources.map((s) => (
            <li key={s.url}>
              <a href={s.url} target="_blank" rel="noreferrer noopener" className="underline">
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <p className="mt-2">
          자료마다 성의 둘레와 높이가 다르게 적혀 있어, <b>지금 남아 있는 것</b>만 적었어요.
        </p>
      </div>
    </div>
  );
}
