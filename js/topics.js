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
