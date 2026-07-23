// 서비스 계정으로 Firestore/Storage 보안 규칙 + 인덱스 배포 (firebase CLI 로그인 불필요)
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

// ---- .env.local 파싱 ----
const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n');
const bucket = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/cloud-platform', 'https://www.googleapis.com/auth/firebase'],
});
const client = await auth.getClient();
const { token } = await client.getAccessToken();

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

const RULES_BASE = `https://firebaserules.googleapis.com/v1/projects/${projectId}`;

async function deployRuleset(fileName, releaseId) {
  const content = readFileSync(fileName, 'utf8');
  const created = await api('POST', `${RULES_BASE}/rulesets`, {
    source: { files: [{ name: fileName, content }] },
  });
  if (created.status !== 200) {
    console.error(`✗ ${fileName} 룰셋 생성 실패:`, created.status, JSON.stringify(created.json, null, 1));
    return false;
  }
  const rulesetName = created.json.name;

  const releaseName = `projects/${projectId}/releases/${releaseId}`;
  const patched = await api('PATCH', `${RULES_BASE}/releases/${encodeURIComponent(releaseId)}`, {
    release: { name: releaseName, rulesetName },
  });
  if (patched.status === 200) {
    console.log(`✓ ${fileName} → ${releaseId} 배포 완료`);
    return true;
  }
  // 릴리즈가 없으면 생성
  const posted = await api('POST', `${RULES_BASE}/releases`, { name: releaseName, rulesetName });
  if (posted.status === 200) {
    console.log(`✓ ${fileName} → ${releaseId} 신규 릴리즈 생성 완료`);
    return true;
  }
  console.error(`✗ ${fileName} 릴리즈 실패:`, patched.status, JSON.stringify(patched.json).slice(0, 300), '/', posted.status, JSON.stringify(posted.json).slice(0, 300));
  return false;
}

// ---- 인덱스 (collection-group 단일 필드 오버라이드) ----
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)`;

async function deployFieldOverride(collectionGroup, fieldPath) {
  const url = `${FS_BASE}/collectionGroups/${collectionGroup}/fields/${fieldPath}?updateMask=indexConfig`;
  const body = {
    indexConfig: {
      indexes: [
        { queryScope: 'COLLECTION', fields: [{ fieldPath, order: 'ASCENDING' }] },
        { queryScope: 'COLLECTION', fields: [{ fieldPath, order: 'DESCENDING' }] },
        { queryScope: 'COLLECTION', fields: [{ fieldPath, arrayConfig: 'CONTAINS' }] },
        { queryScope: 'COLLECTION_GROUP', fields: [{ fieldPath, order: 'ASCENDING' }] },
      ],
    },
  };
  const res = await api('PATCH', url, body);
  if (res.status === 200) {
    console.log(`✓ 인덱스 오버라이드: ${collectionGroup}.${fieldPath}`);
    return true;
  }
  console.error(`✗ 인덱스 실패 ${collectionGroup}.${fieldPath}:`, res.status, JSON.stringify(res.json).slice(0, 300));
  return false;
}

/**
 * 복합 인덱스 (`firestore.indexes.json` 의 `indexes`).
 *
 * **예전에는 이 파일을 아무도 안 읽었다.** 필드 오버라이드만 코드에 박아 배포하고
 * 있어서, indexes 에 적어둔 것은 배포되지 않는 장식이었다.
 * 등호가 둘 이상인 질의는 Firestore 가 단일 필드 색인을 합쳐 쓰는 것이 보통이지만,
 * 합치기가 안 되면 **화면에서 그 목록만 조용히 비어 보인다.**
 */
async function deployCompositeIndexes() {
  let spec;
  try {
    spec = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
  } catch (e) {
    console.error('✗ firestore.indexes.json 을 읽지 못했습니다:', String(e).slice(0, 120));
    return false;
  }
  let all = true;
  for (const idx of spec.indexes ?? []) {
    const url = `${FS_BASE}/collectionGroups/${idx.collectionGroup}/indexes`;
    const body = {
      queryScope: idx.queryScope || 'COLLECTION',
      fields: (idx.fields ?? []).map((f) => (
        f.arrayConfig ? { fieldPath: f.fieldPath, arrayConfig: f.arrayConfig }
                      : { fieldPath: f.fieldPath, order: f.order || 'ASCENDING' }
      )),
    };
    const label = `${idx.collectionGroup}(${body.fields.map((f) => f.fieldPath).join(', ')})`;
    const res = await api('POST', url, body);
    if (res.status === 200) {
      // 만들어 두면 끝이 아니다 — 색인이 다 만들어질 때까지 그 질의는 실패한다
      console.log(`✓ 복합 인덱스 생성: ${label} (만들어지는 데 몇 분 걸립니다)`);
    } else if (res.status === 409) {
      console.log(`· 복합 인덱스 이미 있음: ${label}`);
    } else {
      console.error(`✗ 복합 인덱스 실패 ${label}:`, res.status, JSON.stringify(res.json).slice(0, 300));
      all = false;
    }
  }
  return all;
}

console.log(`프로젝트: ${projectId}, 버킷: ${bucket}`);
let ok = true;
ok = (await deployRuleset('firestore.rules', 'cloud.firestore')) && ok;
ok = (await deployRuleset('storage.rules', `firebase.storage/${bucket}`)) && ok;
ok = (await deployFieldOverride('artworks', 'status')) && ok;
ok = (await deployFieldOverride('artworks', 'artistUid')) && ok;
ok = (await deployCompositeIndexes()) && ok;
process.exit(ok ? 0 : 1);
