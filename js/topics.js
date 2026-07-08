// ScienceCoLab — 주제 레지스트리
// 새 주제 추가 방법: 아래에 항목을 하나 추가하고, Code.gs의 TOPIC_SHEETS에 같은 이름을 등록하면 끝.
//
// 항목 설명:
//   legacy       true면 기존 무파라미터 API(기온·습도) 사용 + FAB/입력 모달 표시
//   apiTopic     GAS ?topic= 파라미터 값 (스프레드시트 응답 탭 이름과 동일)
//   chartMetrics 꺾은선/막대 차트에 그릴 수치 (축 하나를 공유 — legacy만 예외적으로 y1 사용)
//   statFields   선택된 기록 헤더에 크게 표시할 수치
//   groupBy      막대그래프 그룹 기준 필드
//   tagFields    태그로 표시할 필드 (label이 있으면 "라벨: 값" 형태)
//   marker       지도 알약 마커의 대표값(학교 평균) + 색상 스케일

const TOPIC_FMT = {
  num(v) {
    if (v === null || v === undefined || isNaN(v)) return '-';
    return Number(v).toFixed(1).replace(/\.0$/, '');
  }
};

const TOPICS = {
  climate: {
    id: 'climate',
    label: '기온·습도',
    icon: '🌡️',
    legacy: true,
    apiTopic: null,
    chartMetrics: [
      { key: 'temp', label: '기온 (℃)', unit: '℃', color: '#d96b3e', axis: 'y' },
      { key: 'humidity', label: '습도 (%)', unit: '%', color: '#5b8def', axis: 'y1' }
    ],
    statFields: [
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    groupBy: { key: 'location', title: '측정 장소별 평균' },
    tagFields: [{ key: 'environment', label: null }],
    envTitle: '학교 주변 환경',
    hasNotes: true,
    marker: {
      key: 'temp',
      format: v => TOPIC_FMT.num(v) + '℃',
      scale: { type: 'linear', min: 18, max: 36, from: '#4a7dd6', to: '#d14b30' }
    }
  },

  heat: {
    id: 'heat',
    label: '열섬',
    icon: '🔥',
    apiTopic: '열섬',
    chartMetrics: [
      { key: 'temp', label: '온도 (℃)', unit: '℃', color: '#d96b3e', axis: 'y' }
    ],
    statFields: [
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' }
    ],
    groupBy: { key: 'surface', title: '바닥 재질별 평균 온도' },
    tagFields: [
      { key: 'surface', label: '재질' },
      { key: 'heatSource', label: '열원' },
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

  solar: {
    id: 'solar',
    label: '태양광',
    icon: '☀️',
    apiTopic: '태양광',
    chartMetrics: [
      { key: 'voltage', label: '최대 전압 (V)', unit: 'V', color: '#8c6dd9', axis: 'y' }
    ],
    statFields: [
      { key: 'voltage', icon: '⚡', unit: 'V', color: '#8c6dd9' },
      { key: 'lux', icon: '☀️', unit: 'lx', color: '#b07a1f' },
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    groupBy: { key: 'location', title: '측정 장소별 평균 전압' },
    tagFields: [{ key: 'weather', label: '날씨' }],
    envTitle: '측정 당시 상황',
    hasNotes: false,
    marker: {
      key: 'voltage',
      format: v => TOPIC_FMT.num(v) + 'V',
      scale: { type: 'linear', min: 0, max: 6, from: '#8a94a8', to: '#7a4fd0' }
    }
  },

  dust: {
    id: 'dust',
    label: '미세먼지',
    icon: '💨',
    apiTopic: '미세먼지',
    chartMetrics: [
      { key: 'pm10', label: 'PM10 (㎍/㎥)', unit: '㎍/㎥', color: '#0d9488', axis: 'y' },
      { key: 'pm25', label: 'PM2.5 (㎍/㎥)', unit: '㎍/㎥', color: '#8c6dd9', axis: 'y' }
    ],
    statFields: [
      { key: 'pm10', icon: '🌫', unit: '㎍/㎥', color: '#0d9488' },
      { key: 'pm25', icon: '💨', unit: '㎍/㎥', color: '#8c6dd9' },
      { key: 'temp', icon: '🌡', unit: '℃', color: '#d96b3e' },
      { key: 'humidity', icon: '💧', unit: '%', color: '#5b8def' }
    ],
    groupBy: { key: 'location', title: '측정 장소별 평균 농도' },
    tagFields: [
      { key: 'weather', label: '날씨' },
      { key: 'cleaning', label: '청소' }
    ],
    envTitle: '측정 당시 상황',
    hasNotes: true,
    marker: {
      key: 'pm25',
      format: v => 'PM2.5 ' + TOPIC_FMT.num(v),
      // 환경부 초미세먼지(PM2.5) 등급 구간
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
  }
};
