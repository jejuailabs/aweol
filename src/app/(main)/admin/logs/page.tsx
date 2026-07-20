'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/auth-context';

interface LogRow {
  id: string;
  uid: string;
  displayName: string;
  role: string | null;
  action: string;
  classId: string | null;
  detail: string;
  ip: string;
  userAgent: string;
  createdAt: Date | null;
}

function shortUA(ua: string) {
  if (/iPhone|iPad/i.test(ua)) return 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows/i.test(ua)) return 'Windows';
  if (/Macintosh/i.test(ua)) return 'Mac';
  return '기타';
}

export default function AccessLogsPage() {
  const router = useRouter();
  const { user, role, actualRole, loading } = useAuth();
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [fetched, setFetched] = useState(false);
  const [denied, setDenied] = useState(false);
  const [filterUid, setFilterUid] = useState<string | null>(null);

  useEffect(() => {
    // 역할 테스트 중이어도 실제 계정이 슈퍼 관리자여야 본다
    if (!loading && (!user || actualRole !== 'super_admin')) {
      router.replace('/');
      return;
    }
    async function fetchLogs() {
      if (!db) return;
      try {
        const snap = await getDocs(
          query(collection(db, 'accessLogs'), orderBy('createdAt', 'desc'), limit(300))
        );
        setLogs(
          snap.docs.map((d) => {
            const v = d.data();
            return {
              id: d.id,
              uid: v.uid || '',
              displayName: v.displayName || '(이름 없음)',
              role: v.role ?? null,
              action: v.action || '',
              classId: v.classId ?? null,
              detail: v.detail || '',
              ip: v.ip || 'unknown',
              userAgent: v.userAgent || '',
              createdAt: v.createdAt?.toDate?.() ?? null,
            };
          })
        );
      } catch {
        setDenied(true);
      }
      setFetched(true);
    }
    if (!loading && user) fetchLogs();
  }, [user, actualRole, loading, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-sm" style={{ color: 'var(--color-text-sub)' }}>로딩 중...</div>
      </div>
    );
  }

  // 같은 계정이 서로 다른 IP에서 쓰였는지 = 도용 의심 신호
  const ipsByUid = logs.reduce<Record<string, Set<string>>>((acc, l) => {
    (acc[l.uid] ||= new Set()).add(l.ip);
    return acc;
  }, {});
  const suspicious = Object.entries(ipsByUid)
    .filter(([, ips]) => ips.size >= 3)
    .map(([uid, ips]) => ({
      uid,
      name: logs.find((l) => l.uid === uid)?.displayName || uid,
      count: ips.size,
    }));

  const shown = filterUid ? logs.filter((l) => l.uid === filterUid) : logs;

  return (
    <div className="px-4 pt-6 pb-24 mx-auto max-w-[860px]">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => router.push('/')} className="text-xs" style={{ color: 'var(--color-text-sub)' }}>
          ← 대시보드
        </button>
        <h1 className="text-xl font-bold" style={{ color: 'var(--color-text-main)' }}>
          🔎 접근 기록
        </h1>
      </div>
      <p className="text-xs mb-5" style={{ color: 'var(--color-text-sub)' }}>
        칠판 쓰기 등 기록이 남는 행동의 작성자와 접속 IP입니다. 계정 도용 확인용이며 슈퍼 관리자만 볼 수 있어요.
      </p>

      {denied && (
        <div className="rounded-2xl p-4 text-xs" style={{ background: '#FFF1F0', color: '#C0392B' }}>
          기록을 읽을 권한이 없습니다.
        </div>
      )}

      {/* 도용 의심 */}
      {suspicious.length > 0 && (
        <div className="rounded-2xl p-4 mb-4" style={{ background: '#FFF6E5', border: '1px solid #F0D9A8' }}>
          <div className="text-xs font-bold mb-1.5" style={{ color: '#8A6D2F' }}>
            ⚠️ 여러 곳에서 접속한 계정
          </div>
          <div className="flex flex-wrap gap-1.5">
            {suspicious.map((s) => (
              <button
                key={s.uid}
                onClick={() => setFilterUid(s.uid)}
                className="rounded-lg px-2.5 py-1 text-[11px] font-bold"
                style={{ background: 'white', color: '#8A6D2F' }}
              >
                {s.name} · IP {s.count}개
              </button>
            ))}
          </div>
          <div className="text-[10px] mt-2" style={{ color: '#A08A5B' }}>
            집·학교·모바일 데이터를 오가면 자연스럽게 여러 IP가 잡힙니다. 시간대까지 함께 확인하세요.
          </div>
        </div>
      )}

      {filterUid && (
        <button
          onClick={() => setFilterUid(null)}
          className="mb-3 rounded-full px-3 py-1.5 text-[11px] font-bold"
          style={{ background: 'var(--color-primary)', color: 'white' }}
        >
          전체 보기로 돌아가기 ✕
        </button>
      )}

      {fetched && shown.length === 0 && !denied && (
        <div
          className="rounded-2xl p-8 text-center text-xs"
          style={{ background: 'var(--color-surface-soft)', color: 'var(--color-text-sub)' }}
        >
          아직 기록이 없습니다
        </div>
      )}

      {shown.length > 0 && (
        <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--color-surface-soft)' }}>
          {shown.map((l) => (
            <div
              key={l.id}
              className="px-4 py-3 border-t first:border-t-0"
              style={{ borderColor: 'var(--color-surface)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-xs font-bold truncate" style={{ color: 'var(--color-text-main)' }}>
                    {l.displayName}
                  </span>
                  <span className="text-[9px] shrink-0" style={{ color: 'var(--color-text-sub)' }}>
                    {l.role}
                  </span>
                </div>
                <span className="text-[10px] shrink-0" style={{ color: 'var(--color-text-sub)' }}>
                  {l.createdAt ? l.createdAt.toLocaleString('ko-KR') : ''}
                </span>
              </div>
              <div className="text-[11px] mt-0.5" style={{ color: 'var(--color-text-main)' }}>
                {l.action}
                {l.classId && ` · ${l.classId}반`}
                {l.detail && ` · ${l.detail}`}
              </div>
              <div className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--color-text-sub)' }}>
                {l.ip} · {shortUA(l.userAgent)}
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] mt-4 leading-relaxed" style={{ color: 'var(--color-text-sub)' }}>
        ※ IP는 개인정보에 해당합니다. 도용·부적절 게시 확인 목적으로만 사용하고,
        보관 기간과 이용 목적을 학교 개인정보 처리방침에 반영하세요.
      </p>
    </div>
  );
}
