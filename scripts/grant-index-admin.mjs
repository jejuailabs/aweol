// 서비스 계정에 Cloud Datastore Index Admin 역할 부여 시도
import { readFileSync } from 'fs';
import { GoogleAuth } from 'google-auth-library';

const env = {};
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2];
}
const projectId = env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/^"|"$/g, '').replace(/\\n/g, '\n');

const auth = new GoogleAuth({
  credentials: { client_email: clientEmail, private_key: privateKey },
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
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
  let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, json };
}

const CRM = `https://cloudresourcemanager.googleapis.com/v1/projects/${projectId}`;
console.log(`프로젝트: ${projectId}`);
console.log(`서비스 계정: ${clientEmail}\n`);

// 1) 이 서비스 계정이 IAM 정책을 수정할 수 있는지 확인
const test = await api('POST', `${CRM}:testIamPermissions`, {
  permissions: ['resourcemanager.projects.setIamPolicy', 'resourcemanager.projects.getIamPolicy'],
});
const allowed = test.json.permissions || [];
console.log('보유 권한:', allowed.length ? allowed.join(', ') : '(없음)');

if (!allowed.includes('resourcemanager.projects.setIamPolicy')) {
  console.log('\n=> 자동 부여 불가: 이 서비스 계정에는 IAM 정책 수정 권한이 없습니다.');
  console.log('   (보안상 서비스 계정이 스스로에게 역할을 줄 수 없는 것이 정상입니다)');
  console.log('\n[콘솔에서 직접 진행할 내용]');
  console.log(`1. https://console.cloud.google.com/iam-admin/iam?project=${projectId} 접속`);
  console.log('2. 상단 [+ 액세스 권한 부여] 클릭');
  console.log(`3. 새 주 구성원: ${clientEmail}`);
  console.log('4. 역할: "Cloud Datastore 색인 관리자" (Cloud Datastore Index Admin) 선택');
  console.log('5. 저장 → 1~2분 후 아래 명령 실행');
  console.log('   node scripts/deploy-firebase-rules.mjs');
  process.exit(2);
}

// 2) 권한이 있으면 역할 부여
const ROLE = 'roles/datastore.indexAdmin';
const member = `serviceAccount:${clientEmail}`;
const pol = await api('POST', `${CRM}:getIamPolicy`, {});
if (pol.status !== 200) {
  console.error('IAM 정책 조회 실패:', pol.status, JSON.stringify(pol.json).slice(0, 300));
  process.exit(1);
}
const policy = pol.json;
policy.bindings = policy.bindings || [];
let binding = policy.bindings.find((b) => b.role === ROLE);
if (binding && (binding.members || []).includes(member)) {
  console.log(`\n이미 ${ROLE} 역할이 부여되어 있습니다.`);
  process.exit(0);
}
if (binding) binding.members = [...(binding.members || []), member];
else policy.bindings.push({ role: ROLE, members: [member] });

const setRes = await api('POST', `${CRM}:setIamPolicy`, { policy });
if (setRes.status === 200) {
  console.log(`\n✓ ${ROLE} 역할 부여 완료 (전파에 1~2분 소요)`);
  process.exit(0);
}
console.error('역할 부여 실패:', setRes.status, JSON.stringify(setRes.json).slice(0, 400));
process.exit(1);
