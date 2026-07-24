'use client';

import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import {
  applyOverrides, defaultsFor,
  type PlaceDoc, type QuestDoc, type RpgContent, type SiteDoc,
} from './rpg-content';

/**
 * 이 학교의 마을 조사대 내용.
 *
 * **기본값을 먼저 보여주고, 학교가 고친 것이 오면 갈아 끼운다.**
 * 기다렸다 보여주면 마을에 들어설 때 한 박자 비는데, 그 사이에 아이는
 * 아무것도 없는 마을을 본다. 기본값은 이미 손에 있으니 안 기다린다.
 *
 * 선생님이 어드민에서 고치면 **아이 화면이 곧바로 바뀐다**(`onSnapshot`).
 * 수업 중에 고치고 "새로고침하세요" 라고 말하지 않아도 된다.
 */
export function useRpgContent(schoolId: string): RpgContent {
  const [sites, setSites] = useState<Record<string, SiteDoc>>({});
  const [places, setPlaces] = useState<Record<string, PlaceDoc>>({});
  const [quests, setQuests] = useState<Record<string, QuestDoc>>({});

  useEffect(() => {
    if (!db || !schoolId) return;
    const unsubs = ([
      ['rpgSites', setSites],
      ['rpgPlaces', setPlaces],
      ['rpgQuests', setQuests],
    ] as const).map(([name, set]) =>
      onSnapshot(
        collection(db!, 'schools', schoolId, name),
        (snap) => {
          const out: Record<string, never> = {};
          for (const d of snap.docs) (out as Record<string, unknown>)[d.id] = d.data();
          (set as (v: Record<string, never>) => void)(out);
        },
        () => {}
      )
    );
    return () => unsubs.forEach((u) => u());
  }, [schoolId]);

  return useMemo(
    () => (schoolId ? applyOverrides(schoolId, { sites, places, quests }) : defaultsFor('')),
    [schoolId, sites, places, quests]
  );
}
