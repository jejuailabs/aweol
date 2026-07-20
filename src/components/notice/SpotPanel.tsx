'use client';

import { useEffect, useState, useCallback } from 'react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';
import { canManageClass } from '@/lib/auth-helpers';
import { spotGamesPath } from '@/lib/paths';
import { HomeworkVisibility, SpotLayout } from '@/lib/firestore-schema';
import SpotCompose from './SpotCompose';
import SpotPlay from './SpotPlay';

interface Game {
  id: string;
  title: string;
  originalUrl: string;
  variantUrl: string;
  layout: SpotLayout;
  spotCount: number;
  visibility: HomeworkVisibility;
}

export default function SpotPanel({ schoolId, classId }: { schoolId: string; classId: string }) {
  const { user, role } = useAuth();
  const isStaff = canManageClass(role);

  const [list, setList] = useState<Game[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [writing, setWriting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    if (!db) return;
    return onSnapshot(
      query(collection(db, spotGamesPath(schoolId, classId)), orderBy('createdAt', 'desc')),
      (snap) =>
        setList(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              title: v.title || '',
              originalUrl: v.originalUrl || '',
              variantUrl: v.variantUrl || '',
              layout: v.layout === 'horizontal' ? 'horizontal' : 'vertical',
              spotCount: v.spotCount ?? 0,
              visibility: v.visibility || 'class',
            };
          })
        ),
      () => setList([])
    );
  }, [schoolId, classId]);

  const open = list.find((g) => g.id === openId) || null;

  const remove = useCallback(async (gameId: string) => {
    setRemoving(true);
    try {
      const token = await auth?.currentUser?.getIdToken();
      await fetch(
        `/api/spot-game?schoolId=${schoolId}&classId=${classId}&gameId=${gameId}`,
        { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }
      );
      setOpenId(null);
    } finally {
      setRemoving(false);
    }
  }, [schoolId, classId]);

  if (writing) {
    return (
      <SpotCompose
        schoolId={schoolId}
        classId={classId}
        onDone={() => setWriting(false)}
        onCancel={() => setWriting(false)}
      />
    );
  }

  if (open) {
    return (
      <div>
        <button onClick={() => setOpenId(null)} className="text-[11px] font-bold mb-2.5" style={{ color: '#8A7A5F' }}>
          ← 놀이 목록
        </button>

        {isStaff && (
          <>
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={removing}
              className="float-right rounded-full px-2.5 py-1 text-[10px] font-bold disabled:opacity-40"
              style={{ background: 'rgba(232,96,76,0.15)', color: '#E8604C' }}
            >
              삭제
            </button>
            {confirmDelete && (
              <div className="rounded-xl p-3 mb-2" style={{ background: '#FFF1D6', border: '1px solid #F0D9A8' }}>
                <div className="text-[11px] font-bold mb-2" style={{ color: '#A6762A' }}>
                  지우면 아이들 기록도 함께 사라져요. 정말 지울까요?
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirmDelete(false)}
                    className="flex-1 rounded-lg py-1.5 text-[11px] font-bold"
                    style={{ background: 'white', color: '#8A7A5F' }}
                  >
                    그만두기
                  </button>
                  <button
                    onClick={() => { setConfirmDelete(false); remove(open.id); }}
                    className="flex-1 rounded-lg py-1.5 text-[11px] font-bold text-white"
                    style={{ background: '#E8604C' }}
                  >
                    지우기
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {user ? (
          <SpotPlay
            schoolId={schoolId}
            classId={classId}
            gameId={open.id}
            title={open.title}
            originalUrl={open.originalUrl}
            variantUrl={open.variantUrl}
            layout={open.layout}
            spotCount={open.spotCount}
          />
        ) : (
          <div className="py-10 text-center text-[11px]" style={{ color: '#A89880' }}>
            로그인하면 놀이에 참여할 수 있어요
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      {isStaff && (
        <button
          onClick={() => setWriting(true)}
          className="w-full rounded-2xl py-3 mb-3 text-xs font-bold border-2 border-dashed"
          style={{ borderColor: '#E8A33C80', color: '#A6762A' }}
        >
          + 틀린그림 찾기 만들기
        </button>
      )}

      {list.length === 0 ? (
        <div className="py-10 text-center">
          <div className="text-4xl mb-2">🔍</div>
          <div className="text-xs" style={{ color: '#A89880' }}>아직 만들어진 놀이가 없어요</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list.map((g) => (
            <button
              key={g.id}
              onClick={() => setOpenId(g.id)}
              className="flex items-center gap-3 rounded-2xl p-3 text-left transition-transform hover:scale-[1.01]"
              style={{ background: 'rgba(255,255,255,0.8)' }}
            >
              <div className="h-12 w-12 shrink-0 rounded-xl overflow-hidden" style={{ background: '#F6F0E4' }}>
                {g.originalUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={g.originalUrl} alt="" className="h-full w-full object-cover" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold truncate" style={{ color: '#3A3226' }}>{g.title}</div>
                <div className="flex gap-1.5 mt-1">
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#E8A33C20', color: '#A6762A' }}>
                    {g.spotCount}군데
                  </span>
                  <span className="rounded-full px-2 py-0.5 text-[9px] font-bold" style={{ background: '#8A7A5F20', color: '#8A7A5F' }}>
                    {g.visibility === 'class' ? '함께 보기' : '선생님만'}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
}
