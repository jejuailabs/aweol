import {
  nextTravelMode, speedOf, warpTargets, CAR_ON_M, CAR_OFF_M,
} from '../src/lib/village-travel.ts';
let f=0; const ok=(n,c)=>{console.log((c?'✓':'✗')+' '+n); if(!c)f++;};

console.log('--- 걷기 ↔ 자동차 ---');
ok('학교 앞에서는 걷는다', nextTravelMode(10,'walk')==='walk');
ok('멀리 나가면 차를 탄다', nextTravelMode(120,'walk')==='car');
ok('차로 돌아오면 내린다', nextTravelMode(20,'car')==='walk');
ok('멀리 있으면 계속 차', nextTravelMode(300,'car')==='car');

console.log('--- 경계에서 안 떨리는가 (이게 핵심) ---');
// 사이 구간(70~90m)에서는 하던 대로 둬야 한다
ok(`${CAR_OFF_M}~${CAR_ON_M}m 사이, 걷는 중이면 계속 걷는다`, nextTravelMode(80,'walk')==='walk');
ok(`${CAR_OFF_M}~${CAR_ON_M}m 사이, 차 탄 중이면 계속 탄다`, nextTravelMode(80,'car')==='car');
ok('켜는 선 바로 위 (walk)', nextTravelMode(CAR_ON_M+0.01,'walk')==='car');
ok('켜는 선 바로 아래 (walk)', nextTravelMode(CAR_ON_M-0.01,'walk')==='walk');
ok('끄는 선 바로 아래 (car)', nextTravelMode(CAR_OFF_M-0.01,'car')==='walk');
ok('끄는 선 바로 위 (car)', nextTravelMode(CAR_OFF_M+0.01,'car')==='car');

// 경계를 오가며 흔들어도 뒤집힘이 잦으면 안 된다
let mode='walk', flips=0, prev='walk';
for (let i=0;i<200;i++){
  const d = 80 + Math.sin(i)*8;   // 72~88m 사이에서 왔다갔다
  mode = nextTravelMode(d, mode);
  if (mode!==prev) flips++;
  prev = mode;
}
ok(`사이 구간에서 200번 움직여도 안 뒤집힌다 (뒤집힘 ${flips}회)`, flips===0);

console.log('--- 속도 ---');
ok('차가 걷기보다 빠르다', speedOf('car') > speedOf('walk'));

console.log('--- 워프할 곳 고르기 ---');
const pois=[
  {x:20,z:0,k:'shop',n:'학교코앞가게'},     // 학교에서 20m → 워프할 이유가 없다
  {x:150,z:0,k:'shop',n:'가까운가게'},
  {x:160,z:10,k:'shop',n:'바로옆가게'},     // 위와 60m 안 → 빠져야 함
  {x:200,z:0,k:'park',n:'먼공원'},
  {x:-300,z:100,k:'school',n:'옆학교'},
  {x:50,z:400,k:'shop',n:''},               // 이름 없음 → 빠져야 함
  {x:0,z:-500,k:'shop'},                    // 이름 자체가 없음
  {x:600,z:0,k:'park',n:'먼공원'},          // 이름 중복 → 빠져야 함
];
const t = warpTargets(pois, '애월초등학교');
ok('학교가 언제나 첫 번째', t[0].id==='school' && t[0].name==='애월초등학교');
ok('학교 좌표는 원점', t[0].x===0 && t[0].z===0);
const names = t.map(x=>x.name);
ok('이름 없는 곳은 안 나온다', !names.includes(''));
ok('너무 붙어 있는 곳은 하나만', names.includes('가까운가게') && !names.includes('바로옆가게'));
ok('학교 코앞은 워프 목록에 안 넣는다 (거기 이미 있다)', !names.includes('학교코앞가게'));
ok('이름이 같으면 한 번만', names.filter(n=>n==='먼공원').length===1);
ok('가까운 곳부터', t[1].dist <= t[2].dist);
ok('너무 많이 안 준다', t.length<=8);

const many = Array.from({length:500},(_,i)=>({x:i*100,z:0,k:'shop',n:`가게${i}`}));
ok('수백 개여도 8개까지', warpTargets(many,'학교').length===8);
ok('한 곳도 없으면 학교만', warpTargets([],'학교').length===1);

console.log(`\n실패 ${f}건`); process.exit(f?1:0);
