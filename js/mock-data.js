// ScienceCoLab — 시연용 가상 데이터 (URL에 ?mock=1 붙일 때만 사용됨)
// 실제 운영 데이터가 아니며, 백엔드 없이 화면을 시연/검증하는 용도.
// 학교·수치는 모두 가상이고, 실제 데이터는 GAS API(스프레드시트)에서 온다.

const MOCK_MODE = new URLSearchParams(location.search).has('mock');

const MOCK_DATA = (() => {
  const SCHOOLS = [
    { school: '미래초등학교', lat: 37.4563, lng: 126.7052 },  // 도심
    { school: '한빛초등학교', lat: 37.4852, lng: 126.7215 },  // 주거지
    { school: '푸른초등학교', lat: 37.5240, lng: 126.6788 },  // 공단 인접
    { school: '바다중학교',   lat: 37.3860, lng: 126.6420 },  // 해안
    { school: '숲속초등학교', lat: 37.5450, lng: 126.7370 }   // 공원 옆
  ];

  // 학교별 성격 (열섬 기준온도 / PM2.5 / 최대전압 / 기온 / 습도 / 환경 태그)
  const P = {
    '미래초등학교': { heat: 34.5, pm25: 41, volt: 4.5, temp: 31.5, humid: 52,
      env: ['높은 건물(아파트, 빌딩)이 많다.', '도로에 차가 많이 다닌다.'] },
    '한빛초등학교': { heat: 31.5, pm25: 22, volt: 3.8, temp: 30.0, humid: 58,
      env: ['높은 건물(아파트, 빌딩)이 많다.'] },
    '푸른초등학교': { heat: 32.8, pm25: 56, volt: 4.2, temp: 30.8, humid: 55,
      env: ['도로에 차가 많이 다닌다.'] },
    '바다중학교':   { heat: 28.4, pm25: 12, volt: 5.1, temp: 27.8, humid: 68,
      env: ['바다나 하천이 가깝다.'] },
    '숲속초등학교': { heat: 26.9, pm25: 9,  volt: 2.9, temp: 26.5, humid: 63,
      env: ['학교에 나무가 많거나 근처에 숲이나 공원이 있다.'] }
  };

  const TIMES = ['09:10', '11:30', '13:50'];
  const DATE = '2026-07-10';
  const ts = t => `${DATE}T${t}:00+09:00`;
  const pic = seed => `https://picsum.photos/seed/${seed}/800/600`;
  const r1 = v => Math.round(v * 10) / 10;

  // ── 열섬: 시간대 × 바닥재질 (재질에 따라 온도 차이가 보이도록)
  const HEAT_SPOTS = [
    { location: '학교 앞 아스팔트 주차장', surface: '아스팔트', delta: 1.5 },
    { location: '중앙 현관 보도블럭', surface: '보도블럭', delta: 0 },
    { location: '운동장 옆 잔디밭', surface: '잔디', delta: -3.5 }
  ];
  const heatSchools = SCHOOLS.map((s, si) => ({
    ...s,
    measurements: HEAT_SPOTS.map((spot, i) => ({
      timestamp: ts(TIMES[i]),
      date: DATE, time: TIMES[i],
      location: spot.location,
      surface: spot.surface,
      environment: P[s.school].env,
      heatSource: (si < 2 && i === 0) ? '있음(에어컨 실외기)' : '없음',
      temp: r1(P[s.school].heat + spot.delta + i * 0.6),
      photoUrl: pic(`heat${si}${i}`)
    })).reverse()
  }));

  // ── 태양광: 시간대별 전압·조도 상승
  const SOLAR_DELTA = [-0.8, 0, 0.3];
  const WEATHERS = ['맑음', '맑음', '구름 조금'];
  const solarSchools = SCHOOLS.map((s, si) => ({
    ...s,
    measurements: TIMES.map((t, i) => {
      const v = Math.max(0.5, r1(P[s.school].volt + SOLAR_DELTA[i]));
      return {
        timestamp: ts(t), date: DATE, time: t,
        location: '운동장 중앙 (그늘 없는 곳)',
        temp: r1(P[s.school].temp + i * 1.1),
        humidity: Math.round(P[s.school].humid - i * 3),
        lux: Math.round(v * 17000 + i * 4000),
        voltage: v,
        weather: WEATHERS[i],
        photoUrl: pic(`solar${si}${i}`)
      };
    }).reverse()
  }));

  // ── 미세먼지: 교실 내 측정
  const DUST_DELTA = [-3, 0, 4];
  const CLEANING = ['측정 전 청소함', '청소 안 함', '청소 안 함'];
  const dustSchools = SCHOOLS.map((s, si) => ({
    ...s,
    measurements: TIMES.map((t, i) => {
      const pm25 = Math.max(3, Math.round(P[s.school].pm25 + DUST_DELTA[i]));
      return {
        timestamp: ts(t), date: DATE, time: t,
        location: '3층 교실 (창문 닫음)',
        pm10: Math.round(pm25 * 1.8),
        pm25: pm25,
        temp: r1(P[s.school].temp - 2),
        humidity: Math.round(P[s.school].humid + 4),
        weather: WEATHERS[i],
        cleaning: CLEANING[i],
        notes: i === 2 ? '점심시간 이후 학생 이동이 많았음' : '',
        photoUrl: pic(`dust${si}${i}`)
      };
    }).reverse()
  }));

  // ── 기온·습도 (기존 주제)
  const NAMES = ['김하늘', '이도윤', '박서연'];
  const CLIMATE_LOCS = ['학교 운동장(모래)', '학교 화단', '학교 보도블럭'];
  const climateSchools = SCHOOLS.map((s, si) => ({
    ...s,
    measurements: TIMES.map((t, i) => ({
      timestamp: ts(t), date: DATE, time: t,
      studentName: NAMES[i],
      location: CLIMATE_LOCS[i],
      temp: r1(P[s.school].temp + i * 0.9 - 1),
      humidity: Math.round(P[s.school].humid - i * 2),
      environment: P[s.school].env,
      notes: i === 0 ? '아침이라 바람이 선선했음' : '',
      photoUrl: pic(`climate${si}${i}`)
    })).reverse()
  }));

  return {
    climate: climateSchools,
    '열섬': { topic: '열섬', schools: heatSchools },
    '태양광': { topic: '태양광', schools: solarSchools },
    '미세먼지': { topic: '미세먼지', schools: dustSchools }
  };
})();
