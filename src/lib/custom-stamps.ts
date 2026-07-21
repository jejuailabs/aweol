import { collection, deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
import { resizeImage } from '@/lib/client-image';

/**
 * 선생님이 직접 만든 도장.
 *
 * 상점의 도장은 이모지라 누구 반이든 똑같이 생겼다. 선생님마다 자기 도장이
 * 있으면 아이가 '우리 선생님이 찍어준 것' 으로 느낀다.
 *
 * **용량:** 도장은 작게 보이는 그림이라 160px 로 줄여서 올린다.
 * 원본을 그대로 두면 선생님 한 명이 몇 MB 를 쓰는데, 줄이면 10KB 안쪽이다.
 * 배포 용량이 아니라 Storage 라 요금이 붙는 자리다 — 반드시 줄여서 올린다.
 */

/** 도장 그림 한 변의 최대 크기(px). 화면에서 24px 로 보이니 이 이상은 낭비다. */
const STAMP_PX = 160;

export const CUSTOM_PREFIX = 'custom-';

export interface CustomStamp {
  id: string;
  label: string;
  imageUrl: string;
}

export function customStampsPath(uid: string) {
  return `users/${uid}/stamps`;
}

/** 상점 도장인지 내가 만든 도장인지 */
export function isCustomStamp(itemId: string) {
  return itemId.startsWith(CUSTOM_PREFIX);
}

/**
 * 도장 만들기. 그림을 줄여 올리고 문서를 남긴다.
 *
 * 실패하면 던진다 — 부르는 쪽에서 사람이 읽을 말로 바꿔 보여준다.
 * (조용히 삼키면 '만들었는데 안 보이는' 상태가 된다)
 */
export async function createCustomStamp(uid: string, file: File, label: string) {
  if (!db || !storage) throw new Error('연결이 준비되지 않았어요');
  const clean = label.trim().slice(0, 10) || '내 도장';

  const small = await resizeImage(file, STAMP_PX);
  if (!small) throw new Error('그림을 줄이지 못했어요');

  const id = `${CUSTOM_PREFIX}${Date.now()}`;
  const path = `stamps/${uid}/${id}.jpg`;
  await uploadBytes(ref(storage, path), small.blob);
  const imageUrl = await getDownloadURL(ref(storage, path));

  await setDoc(doc(collection(db, customStampsPath(uid)), id), {
    label: clean,
    imageUrl,
    createdAt: serverTimestamp(),
  });

  return { id, label: clean, imageUrl } satisfies CustomStamp;
}

/**
 * 도장 지우기.
 *
 * **이미 찍어준 도장은 그대로 둔다.** 제출물에는 그림 주소가 복사돼 있으므로
 * 여기서 지워도 아이가 받은 도장이 사라지지 않는다 — 받았다 뺏기면 안 된다.
 * 그래서 Storage 파일도 남긴다(지우면 이미 찍힌 도장이 깨진 그림이 된다).
 */
export async function deleteCustomStamp(uid: string, id: string) {
  if (!db) throw new Error('연결이 준비되지 않았어요');
  await deleteDoc(doc(collection(db, customStampsPath(uid)), id));
}

/** 쓰지 않는다 — 위 주석의 이유로 파일은 남긴다. 나중에 정리 도구를 만들 때 쓴다. */
export async function purgeStampFile(uid: string, id: string) {
  if (!storage) return;
  await deleteObject(ref(storage, `stamps/${uid}/${id}.jpg`)).catch(() => {});
}
