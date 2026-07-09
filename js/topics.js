// ScienceCoLab — 주제 레지스트리 (2026 공동탐구 공식 7주제 기준)
// 새 주제 추가: 아래에 항목 추가 + Code.gs의 TOPIC_SHEETS에 같은 apiTopic 등록.
//
// 항목 설명:
//   apiTopic     GAS ?topic= 파라미터 값 (= 응답 스프레드시트 주제명)
//   chartMetrics 꺾은선/막대에 그릴 수치. 비우면([]) 꺾은선 없음.
//   barMode      'group'(기본, groupBy 필드별 평균) | 'metrics'(chartMetrics 각각을 막대 하나로)
//   groupBy      barMode 'group'일 때 막대 그룹 기준 필드. null이면 막대 없음.
//   statFields   선택된 기록 헤더에 크게 표시할 수치
//   tagFields    태그로 표시할 필드 (label 있으면 "라벨: 값")
//   marker       지도 알약 마커 대표값(학교 평균) + 색상 스케일
//                key가 파생값(예: total)이면 데이터 레코드에 그 값이 들어있어야 함

// 열섬 '측정 환경' 체크박스 옵션 (Code.gs의 HEAT_ENV_OPTIONS와 동일하게 유지할 것)
const HEAT_ENV_OPTIONS = [
  '주변에 건물이 많음', '나무가 많아 그늘짐', '차량 통행이 잦음',
  '주변에 물(분수, 연못 등)이 있음', '사람들의 이동이 많은 개방된 공간'
];
// 소리데이터 '측정 상황' 체크박스 옵션 (Code.gs의 SOUND_SITUATION_OPTIONS와 동일하게 유지)
const SOUND_SITUATION_OPTIONS = [
  '대화소리 많음', '기계음(에어컨, 히터 등)', '외부소음(자동차, 공사 등)', '조용함'
];
// 여러 주제 공통 날씨 선택지
const WEATHER_OPTIONS = ['맑음', '구름조금', '흐림', '비', '눈'];
// 집중도/피로도 3단계
const LEVEL_OPTIONS = ['높음', '보통', '낮음'];

const TOPIC_FMT = {
  num(v) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return Number(v).toFixed(1).replace(/\.0$/, '');
  },
  int(v) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return String(Math.round(Number(v)));
  }
};

const TOPICS = {
  // 1) 열섬 ───────────────────────────────────────
  heat: {
    id: 'heat',
    label: '열섬',
    icon: '🔥',
    apiTopic: '열섬',
    input: true,                 // 앱 모달 입력 (Forms 아님) → 로그인 후 설문 제출
    inputTitle: '🔥 열섬 측정 기록',
    inputFields: [
      { key: 'date',        label: '측정 날짜', type: 'date',   required: true },
      { key: 'time',        label: '측정 시간', type: 'time',   required: true },
      { key: 'weather',     label: '날씨',      type: 'select', required: true,
        options: ['맑음', '구름조금', '흐림', '비', '눈'] },
      { key: 'location',    label: '측정 장소', type: 'text',   required: true, maxlength: 60,
        placeholder: '예: 운동장 한가운데' },
      { key: 'surface',     label: '바닥 상태', type: 'select', required: true,
        options: ['아스팔트', '콘크리트', '보도블록', '흙', '잔디', '모래', '기타'] },
      { key: 'environment', label: '측정 환경', type: 'checkbox', options: HEAT_ENV_OPTIONS },
      { key: 'heatSource',  label: '주변 열원', type: 'text', maxlength: 60,
        placeholder: '예: 에어컨 실외기, 자동차 (없으면 비워두기)' },
      { key: 'temp',        label: '기온 (℃)', type: 'number', step: 0.1, required: true,
        placeholder: '예: 31.4' },
      { key: 'photo',       label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [
      { key: 'temp', label: '온도 (℃)', unit: '℃', color: '#d96b3e', axis: 'y' }
    ],
    barMode: 'group',
    groupBy: { key: 'surface', title: '바닥 상태별 평균 온도' },
    statFields: [
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' }
    ],
    tagFields: [
      { key: 'surface', label: '바닥' },
      { key: 'heatSource', label: '열원' },
      { key: 'weather', label: '날씨' },
      { key: 'environment', label: null }
    ],
    envTitle: '측정 환경',
    hasNotes: false,
    marker: {
      key: 'temp',
      format: v => TOPIC_FMT.num(v) + '℃',
      scale: { type: 'linear', min: 24, max: 38, from: '#4a7dd6', to: '#d14b30' }
    }
  },

  // 2) 태양광 ─────────────────────────────────────
  solar: {
    id: 'solar',
    label: '태양광',
    icon: '☀️',
    apiTopic: '태양광',
    input: true,
    inputTitle: '☀️ 태양광 측정 기록',
    inputFields: [
      { key: 'date',     label: '측정 날짜', type: 'date', required: true },
      { key: 'location', label: '측정 장소', type: 'text', required: true, maxlength: 60, placeholder: '예: 옥상, 운동장' },
      { key: 'time',     label: '측정 시간', type: 'time', required: true },
      { key: 'temp',     label: '온도 (℃)', type: 'number', step: 0.1, required: true },
      { key: 'humidity', label: '습도 (%)', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'lux',      label: '조도 (lx)', type: 'number', min: 0, step: 1, required: true },
      { key: 'voltage',  label: '최대 전압 (V)', type: 'number', step: 0.01, required: true },
      { key: 'weather',  label: '측정 당시 상황', type: 'select', options: WEATHER_OPTIONS, required: true },
      { key: 'photo',    label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [
      { key: 'voltage', label: '최대 전압 (V)', unit: 'V', color: '#8c6dd9', axis: 'y' }
    ],
    barMode: 'group',
    groupBy: { key: 'location', title: '측정 장소별 평균 전압' },
    statFields: [
      { key: 'voltage', icon: '⚡', unit: 'V', color: '#8c6dd9' },
      { key: 'lux', icon: '☀️', unit: 'lx', color: '#b07a1f' },
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    tagFields: [
      { key: 'time', label: '시간대' },
      { key: 'weather', label: '상황' }
    ],
    envTitle: '측정 당시 상황',
    hasNotes: false,
    marker: {
      key: 'voltage',
      format: v => TOPIC_FMT.num(v) + 'V',
      scale: { type: 'linear', min: 0, max: 6, from: '#8a94a8', to: '#7a4fd0' }
    }
  },

  // 3) 미세먼지 ───────────────────────────────────  (그래프 없이 수치만)
  dust: {
    id: 'dust',
    label: '미세먼지',
    icon: '💨',
    apiTopic: '미세먼지',
    input: true,
    inputTitle: '💨 미세먼지 측정 기록',
    inputFields: [
      { key: 'date',     label: '측정 날짜', type: 'date', required: true },
      { key: 'time',     label: '측정 시간', type: 'time', required: true },
      { key: 'pm10',     label: 'PM10 (㎍/㎥)', type: 'number', min: 0, step: 1, required: true },
      { key: 'pm25',     label: 'PM2.5 (㎍/㎥)', type: 'number', min: 0, step: 1, required: true },
      { key: 'temp',     label: '온도 (℃)', type: 'number', step: 0.1 },
      { key: 'humidity', label: '습도 (%)', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'weather',  label: '날씨', type: 'select', options: WEATHER_OPTIONS, required: true },
      { key: 'cleaning', label: '청소 여부', type: 'select', options: ['했음', '안 했음'] },
      { key: 'airNote',  label: '특이사항', type: 'text', maxlength: 80, placeholder: '주변 상황 등 (선택)' },
      { key: 'photo',    label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [],
    barMode: 'group',
    groupBy: null,
    statFields: [
      { key: 'pm10', icon: '🌫', unit: '㎍/㎥', color: '#0d9488' },
      { key: 'pm25', icon: '💨', unit: '㎍/㎥', color: '#8c6dd9' },
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    tagFields: [
      { key: 'weather', label: '날씨' },
      { key: 'cleaning', label: '청소' },
      { key: 'airNote', label: '주변' }
    ],
    envTitle: '측정 당시 상황',
    hasNotes: false,
    marker: {
      key: 'pm25',
      format: v => 'PM2.5 ' + TOPIC_FMT.num(v),
      scale: {
        type: 'steps',
        steps: [
          { max: 15, color: '#3572c9', label: '좋음' },
          { max: 35, color: '#2a8c55', label: '보통' },
          { max: 75, color: '#c07612', label: '나쁨' },
          { max: Infinity, color: '#c02f24', label: '매우나쁨' }
        ]
      }
    }
  },

  // 4) 우리나라날씨 ───────────────────────────────
  weather: {
    id: 'weather',
    label: '우리나라날씨',
    icon: '🌡️',
    apiTopic: '우리나라날씨',
    input: true,
    inputTitle: '🌡️ 우리나라날씨 기록',
    inputFields: [
      { key: 'date', label: '측정 날짜', type: 'date', required: true },
      { key: 'time', label: '측정 시간', type: 'time', required: true },
      { key: 'temp', label: '온도 (℃)', type: 'number', step: 0.1, required: true },
      { key: 'photo', label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [
      { key: 'temp', label: '온도 (℃)', unit: '℃', color: '#d96b3e', axis: 'y' }
    ],
    barMode: 'group',
    groupBy: { key: 'time', title: '시간대별 평균 온도' },
    statFields: [
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' }
    ],
    tagFields: [
      { key: 'time', label: '시간대' }
    ],
    envTitle: '측정 정보',
    hasNotes: false,
    marker: {
      key: 'temp',
      format: v => TOPIC_FMT.num(v) + '℃',
      scale: { type: 'linear', min: 18, max: 38, from: '#4a7dd6', to: '#d14b30' }
    }
  },

  // 5) 탄소배출 ───────────────────────────────────  (4종 g, 총량 마커)
  carbon: {
    id: 'carbon',
    label: '탄소배출',
    icon: '🗑️',
    apiTopic: '탄소배출',
    input: true,
    inputTitle: '🗑️ 탄소배출(분리수거) 기록',
    inputFields: [
      { key: 'date',     label: '측정 날짜', type: 'date', required: true },
      { key: 'location', label: '측정 장소', type: 'text', required: true, maxlength: 60, placeholder: '예: 3학년 1반' },
      { key: 'paper',    label: '종이 (g)', type: 'number', min: 0, step: 1, required: true },
      { key: 'plastic',  label: '플라스틱 (g)', type: 'number', min: 0, step: 1, required: true },
      { key: 'can',      label: '캔 (g)', type: 'number', min: 0, step: 1, required: true },
      { key: 'general',  label: '일반쓰레기 (g)', type: 'number', min: 0, step: 1, required: true },
      { key: 'photo',    label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [
      { key: 'paper',   label: '종이',   unit: 'g', color: '#c9a227', axis: 'y' },
      { key: 'plastic', label: '플라스틱', unit: 'g', color: '#4a9ed6', axis: 'y' },
      { key: 'can',     label: '캔',     unit: 'g', color: '#8a94a8', axis: 'y' },
      { key: 'general', label: '일반',   unit: 'g', color: '#7a7a7a', axis: 'y' }
    ],
    barMode: 'metrics',
    barTitle: '종류별 평균 배출량',
    groupBy: null,
    statFields: [
      { key: 'paper',   icon: '📄', unit: 'g', color: '#b8901f' },
      { key: 'plastic', icon: '🧴', unit: 'g', color: '#4a9ed6' },
      { key: 'can',     icon: '🥫', unit: 'g', color: '#7a8496' },
      { key: 'general', icon: '🗑', unit: 'g', color: '#6f6f6f' }
    ],
    tagFields: [
      { key: 'location', label: '장소' }
    ],
    envTitle: '측정 정보',
    hasNotes: false,
    marker: {
      key: 'total',
      format: v => TOPIC_FMT.int(v) + 'g',
      scale: { type: 'linear', min: 0, max: 2000, from: '#a8c98a', to: '#3d6b1f' }
    }
  },

  // 6) 소리데이터 ─────────────────────────────────
  sound: {
    id: 'sound',
    label: '소리데이터',
    icon: '🔊',
    apiTopic: '소리데이터',
    input: true,
    inputTitle: '🔊 소리데이터 측정 기록',
    inputFields: [
      { key: 'date',          label: '측정 날짜', type: 'date', required: true },
      { key: 'time',          label: '측정 시간', type: 'time', required: true },
      { key: 'location',      label: '측정 장소', type: 'text', required: true, maxlength: 60, placeholder: '예: 급식실, 복도' },
      { key: 'temp',          label: '온도 (℃)', type: 'number', step: 0.1 },
      { key: 'humidity',      label: '습도 (%)', type: 'number', min: 0, max: 100, step: 1 },
      { key: 'soundAvg',      label: '소리 평균 (dB)', type: 'number', step: 0.1, required: true },
      { key: 'soundMax',      label: '소리 최대 (dB)', type: 'number', step: 0.1, required: true },
      { key: 'situation',     label: '측정 상황', type: 'checkbox', options: SOUND_SITUATION_OPTIONS },
      { key: 'concentration', label: '집중도', type: 'select', options: LEVEL_OPTIONS },
      { key: 'fatigue',       label: '피로도', type: 'select', options: LEVEL_OPTIONS },
      { key: 'placeFeature',  label: '장소 특징', type: 'text', maxlength: 60, placeholder: '선택' },
      { key: 'notes',         label: '특이사항', type: 'text', maxlength: 80, placeholder: '선택' },
      { key: 'photo',         label: '측정 사진', type: 'photo', required: true }
    ],
    chartMetrics: [
      { key: 'soundAvg', label: '소리 평균', unit: '', color: '#5b8def', axis: 'y' },
      { key: 'soundMax', label: '소리 최대', unit: '', color: '#d96b3e', axis: 'y' }
    ],
    barMode: 'group',
    groupBy: { key: 'location', title: '장소별 평균 소음' },
    statFields: [
      { key: 'soundAvg', icon: '🔊', unit: '', color: '#4a6dc7' },
      { key: 'soundMax', icon: '📢', unit: '', color: '#d96b3e' },
      { key: 'temp', icon: '🌡', unit: '℃', color: '#e08a4e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    tagFields: [
      { key: 'location', label: '장소' },
      { key: 'time', label: '시간대' },
      { key: 'concentration', label: '집중도' },
      { key: 'fatigue', label: '피로도' },
      { key: 'placeFeature', label: '특징' },
      { key: 'situation', label: null }
    ],
    envTitle: '측정 당시 상황',
    hasNotes: true,
    marker: {
      key: 'soundAvg',
      format: v => TOPIC_FMT.num(v),
      scale: { type: 'linear', min: 40, max: 90, from: '#4a90d6', to: '#d14b30' }
    }
  },

  // 7) 생태지도 ───────────────────────────────────  (관찰 지점 = 핀 하나, 앱에서 지도 클릭 입력)
  ecomap: {
    id: 'ecomap',
    label: '생태지도',
    icon: '🌿',
    apiTopic: '생태지도',
    pointMode: true,            // 학교 집계가 아닌 관찰 지점별 핀 + 클러스터
    input: true,                // 앱 내 지도 클릭 입력 (Forms 아님)
    inputTitle: '🌿 생태 관찰 기록',
    inputFields: [
      { key: 'coord',    type: 'coord' },   // 지도에서 찍은 위치 (특수 렌더)
      { key: 'date',     label: '관찰 날짜', type: 'date', required: true },
      { key: 'location', label: '관찰 장소 설명', type: 'text', required: true, maxlength: 60,
        placeholder: '예: 운동장 화단 옆' },
      { key: 'species',  label: '관찰한 생명체 (동물·식물)', type: 'text', required: true, maxlength: 40,
        placeholder: '예: 민들레, 참새' },
      { key: 'count',    label: '개체 수', type: 'number', required: true, min: 1, step: 1, placeholder: '12' },
      { key: 'temp',     label: '온도 (℃)', type: 'number', step: 0.1, optionalNote: '식물이면' },
      { key: 'humidity', label: '습도 (%)', type: 'number', min: 0, max: 100, step: 1, optionalNote: '식물이면' },
      { key: 'photo',    label: '관찰 사진', type: 'photo', required: true }
    ],
    chartMetrics: [],
    barMode: 'group',
    groupBy: null,
    statFields: [
      { key: 'count', icon: '🔢', unit: '개체', color: '#3d8b40' }
    ],
    tagFields: [
      { key: 'school', label: '학교' },
      { key: 'studentName', label: '관찰자' },
      { key: 'location', label: '장소' },
      { key: 'temp', label: '온도(℃)' },
      { key: 'humidity', label: '습도(%)' }
    ],
    envTitle: '관찰 정보',
    hasNotes: false,
    marker: {
      key: 'count',
      pointColor: '#3d8b40',                 // 핀 색 (관찰 지점 고정색)
      label: rec => rec.species || '관찰'      // 마커 title(hover) + 사이드바 제목
    }
  }
};
