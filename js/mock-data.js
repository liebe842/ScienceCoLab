// ScienceCoLab — 시연용 가상 데이터 (URL에 ?mock=1 붙일 때만 사용됨)
// 실제 운영 데이터가 아니며, 백엔드 없이 화면을 시연/검증하는 용도.
// 학교·수치는 모두 가상이고, 값·선택지는 실제 공동탐구 폼 항목을 따름.
// 각 주제 키(apiTopic) → { topic, schools:[ {school,lat,lng,measurements:[...]} ] }

const MOCK_MODE = new URLSearchParams(location.search).has('mock');

const MOCK_DATA = (() => {
  const SCHOOLS = [
    { school: '미래초등학교', lat: 37.4563, lng: 126.7052 },  // 도심
    { school: '한빛초등학교', lat: 37.4852, lng: 126.7215 },  // 주거지
    { school: '푸른초등학교', lat: 37.5240, lng: 126.6788 },  // 공단 인접
    { school: '바다중학교',   lat: 37.3860, lng: 126.6420 },  // 해안
    { school: '숲속초등학교', lat: 37.5450, lng: 126.7370 }   // 공원 옆
  ];

  // 학교별 성격값 (도심=덥고 탁하고 시끄러움 → 숲=시원·맑음·조용)
  const P = {
    '미래초등학교': { heat: 34.5, pm25: 41, volt: 4.5, temp: 31.5, humid: 52, sound: 72, waste: 1.6 },
    '한빛초등학교': { heat: 31.5, pm25: 22, volt: 3.8, temp: 30.0, humid: 58, sound: 61, waste: 1.1 },
    '푸른초등학교': { heat: 32.8, pm25: 56, volt: 4.2, temp: 30.8, humid: 55, sound: 66, waste: 1.9 },
    '바다중학교':   { heat: 28.4, pm25: 12, volt: 5.1, temp: 27.8, humid: 68, sound: 55, waste: 0.9 },
    '숲속초등학교': { heat: 26.9, pm25: 9,  volt: 2.9, temp: 26.5, humid: 63, sound: 48, waste: 0.7 }
  };

  const DATE = '2026-07-10';
  const ts = (d, t) => `${d}T${t}:00+09:00`;
  const pic = seed => `https://picsum.photos/seed/${seed}/800/600`;
  const r1 = v => Math.round(v * 10) / 10;
  const ri = v => Math.round(v);
  const build = (apiTopic, fn) => ({
    topic: apiTopic,
    schools: SCHOOLS.map((s, si) => ({ ...s, measurements: fn(s, si).reverse() }))
  });

  // ── 열섬: 시간대 × 바닥 상태 (재질에 따라 온도 차이가 보이도록)
  const HEAT_SPOTS = [
    { time: '09:30', location: '운동장',    surface: '아스팔트', delta: 1.6 },
    { time: '12:00', location: '학교 현관', surface: '보도블록', delta: 0.2 },
    { time: '14:30', location: '학교숲',    surface: '잔디',    delta: -3.4 }
  ];
  const HEAT_WEATHER = ['맑음', '맑음', '구름많음'];
  const HEAT_ENV = [
    ['주변에 건물이 많음', '차량 통행이 잦음'],
    ['주변에 건물이 많음'],
    ['차량 통행이 잦음', '사람들의 이동이 많은 개방된 공간'],
    ['주변에 물(분수, 연못 등)이 있음'],
    ['나무가 많아 그늘짐']
  ];
  const heat = build('열섬', (s, si) => HEAT_SPOTS.map((spot, i) => ({
    timestamp: ts(DATE, spot.time), date: DATE, time: spot.time,
    studentName: '20831 홍길동',
    weather: HEAT_WEATHER[i],
    location: spot.location,
    surface: spot.surface,
    environment: HEAT_ENV[si],
    heatSource: (si < 2 && i === 0) ? '가까이에 있음' : '없음',
    temp: r1(P[s.school].heat + spot.delta + i * 0.5),
    photoUrl: pic(`heat${si}${i}`)
  })));

  // ── 태양광: 시간대별 전압·조도 상승
  const SOLAR_TIMES = ['등교시(8~9시)', '오전시간(9시~12시)', '오후시간(13시~16시)'];
  const SOLAR_DELTA = [-0.8, 0.1, 0.4];
  const SOLAR_WEATHER = ['맑음(구름 한점없음)', '맑음(구름 한점없음)', '흐림(구름이 가끔 해를 가림)'];
  const solar = build('태양광', (s, si) => SOLAR_TIMES.map((t, i) => {
    const v = Math.max(0.5, r1(P[s.school].volt + SOLAR_DELTA[i]));
    return {
      timestamp: ts(DATE, ['08:40', '10:30', '14:10'][i]), date: DATE, time: t,
      location: i === 1 ? '학교 창문 및 테라스' : '운동장',
      temp: r1(P[s.school].temp - 3 + i * 1.1),
      humidity: ri(P[s.school].humid - i * 3),
      lux: ri(v * 17000 + i * 4000),
      voltage: v,
      weather: SOLAR_WEATHER[i],
      photoUrl: pic(`solar${si}${i}`)
    };
  }));

  // ── 미세먼지: 교실 내 측정 (장소·시간·날짜 없음, 그래프 없이 수치만)
  const DUST_DELTA = [-3, 0, 4];
  const DUST_WEATHER = ['맑음', '흐림', '흐림'];
  const DUST_CLEAN = ['물청소 완료', '쓸기 완료', '청소 안 함'];
  const DUST_NOTE = ['', '교실 내 학생 이동이 많음', '인근 공사 현장 공사 중'];
  const dust = build('미세먼지', (s, si) => [0, 1, 2].map(i => {
    const pm25 = Math.max(3, ri(P[s.school].pm25 + DUST_DELTA[i]));
    return {
      timestamp: ts(DATE, ['09:00', '11:00', '13:00'][i]),
      date: '', time: '', location: '',
      pm10: ri(pm25 * 1.8),
      pm25: pm25,
      temp: r1(P[s.school].temp - 5),
      humidity: ri(P[s.school].humid + 4),
      weather: DUST_WEATHER[i],
      cleaning: DUST_CLEAN[i],
      airNote: DUST_NOTE[i],
      photoUrl: pic(`dust${si}${i}`)
    };
  }));

  // ── 우리나라날씨: 시간대별 기온 (온도 단일)
  const W_TIMES = ['오전(9~11시)', '점심(12~13시)', '오후(14~16시)'];
  const W_NAMES = ['김하늘', '이도윤', '박서연'];
  const weather = build('우리나라날씨', (s, si) => W_TIMES.map((t, i) => ({
    timestamp: ts(DATE, ['10:00', '12:30', '15:00'][i]), date: DATE, time: t,
    studentName: W_NAMES[i],
    temp: r1(P[s.school].temp + i * 0.9 - 1),
    photoUrl: pic(`weather${si}${i}`)
  })));

  // ── 탄소배출: 1주일간 종류별 배출량(g) (마커 = 총량)
  const DAYS = ['2026-07-06', '2026-07-07', '2026-07-08'];
  const carbon = build('탄소배출', (s, si) => DAYS.map((d, i) => {
    const base = P[s.school].waste * (0.9 + i * 0.15);
    const paper   = ri(base * 520);
    const plastic = ri(base * 340);
    const can     = ri(base * 110);
    const general = ri(base * 430);
    return {
      timestamp: ts(d, '16:00'), date: d,
      studentName: '홍길동', studentId: '20401',
      location: `${s.school} 2학년 4반`,
      paper, plastic, can, general,
      total: paper + plastic + can + general,
      photoUrl: pic(`carbon${si}${i}`)
    };
  }));

  // ── 소리데이터: 장소분류 × 시간분류
  const SOUND_SPOTS = [
    { location: '교실',   time: '자습 시간',        d: -4, sit: ['조용함'],                     con: 5, fat: 1 },
    { location: '복도',   time: '쉬는 시간',        d: 6,  sit: ['대화소리 많음'],               con: 2, fat: 4 },
    { location: '급식실', time: '점심 시간(12시~13시)', d: 10, sit: ['대화소리 많음', '외부소음(자동차, 공사 등)'], con: 1, fat: 5 }
  ];
  const sound = build('소리데이터', (s, si) => SOUND_SPOTS.map((spot, i) => {
    const avgv = Math.min(97, Math.max(35, ri(P[s.school].sound + spot.d)));
    return {
      timestamp: ts(DATE, ['10:20', '11:10', '12:20'][i]), date: DATE,
      location: spot.location, time: spot.time,
      temp: r1(P[s.school].temp - 4),
      humidity: ri(P[s.school].humid),
      soundAvg: avgv,
      soundMax: Math.min(100, avgv + ri(8 + i * 3)),
      situation: spot.sit,
      concentration: spot.con,
      fatigue: spot.fat,
      placeFeature: i === 2 ? '천장 높고 딱딱한 바닥(반사음 큼)' : '일반 교실 마감',
      notes: i === 2 ? '배식 시간이라 인원이 많았음' : '',
      photoUrl: pic(`sound${si}${i}`)
    };
  }));

  // ── 생태지도: 관찰 지점(핀) — 학교 주변 여기저기 (동물=온습도 없음, 식물=있음)
  const ECO = [
    { school: '미래초등학교', lat: 37.4571, lng: 126.7061, species: '민들레',   count: 14, temp: 29.5, humidity: 54, loc: '운동장 화단 옆', who: '홍길동' },
    { school: '미래초등학교', lat: 37.4558, lng: 126.7039, species: '참새',     count: 6,  temp: null, humidity: null, loc: '급식실 뒤 나무', who: '김민준' },
    { school: '한빛초등학교', lat: 37.4861, lng: 126.7223, species: '토끼풀',   count: 30, temp: 28.0, humidity: 60, loc: '뒷마당 잔디밭', who: '이서연' },
    { school: '한빛초등학교', lat: 37.4845, lng: 126.7201, species: '무당벌레', count: 3,  temp: null, humidity: null, loc: '텃밭 상추잎', who: '박도윤' },
    { school: '푸른초등학교', lat: 37.5248, lng: 126.6799, species: '강아지풀', count: 22, temp: 30.1, humidity: 52, loc: '담장 옆 공터', who: '최지우' },
    { school: '푸른초등학교', lat: 37.5231, lng: 126.6775, species: '개미',     count: 40, temp: null, humidity: null, loc: '현관 앞 보도블록', who: '정하준' },
    { school: '바다중학교',   lat: 37.3869, lng: 126.6431, species: '갈대',     count: 18, temp: 27.2, humidity: 70, loc: '하천 둔치', who: '강수아' },
    { school: '바다중학교',   lat: 37.3852, lng: 126.6409, species: '갈매기',   count: 9,  temp: null, humidity: null, loc: '방파제 근처', who: '윤시우' },
    { school: '숲속초등학교', lat: 37.5459, lng: 126.7382, species: '단풍나무', count: 5,  temp: 25.8, humidity: 66, loc: '뒷산 산책로', who: '임채원' },
    { school: '숲속초등학교', lat: 37.5442, lng: 126.7358, species: '청설모',   count: 2,  temp: null, humidity: null, loc: '공원 큰 나무', who: '오은우' }
  ];
  const ecomap = {
    topic: '생태지도',
    schools: SCHOOLS.map(s => s.school),
    observations: ECO.map((o, i) => ({
      timestamp: ts(DATE, ['09:20', '09:50', '10:10', '10:40', '11:00', '11:20', '11:50', '12:10', '13:00', '13:30'][i]),
      school: o.school, studentId: '2' + (i + 10) + '01', studentName: o.who,
      lat: o.lat, lng: o.lng, date: DATE,
      location: o.loc, species: o.species, count: o.count,
      temp: o.temp, humidity: o.humidity,
      photoUrl: pic('eco' + i)
    }))
  };

  return {
    '열섬': heat,
    '태양광': solar,
    '미세먼지': dust,
    '우리나라날씨': weather,
    '탄소배출': carbon,
    '소리데이터': sound,
    '생태지도': ecomap
  };
})();
