// ScienceCoLab — 프론트엔드 로직

let map;
let markers = [];
let clusterer = null;          // 생태지도 관찰 핀 클러스터러
let chartInstance = null;
let lineChartInstance = null;
let schoolsData = [];
let observationsData = [];      // 생태지도(pointMode) 관찰 목록
let schoolNames = [];           // 입력 모달 학교 드롭다운용 이름 목록
// 주제 상태 (js/topics.js의 TOPICS 레지스트리 참조)
let currentTopicId = 'heat';
const topicDataCache = {};
// 사이드바 상태
let sidebarState = {
  school: null
};
// 생태지도 입력 상태
let pickingLocation = false;    // 지도 클릭으로 위치 찍는 중
let tempPin = null;             // 찍은 위치 임시 마커
let pickedLatLng = null;        // { lat, lng }

function currentTopic() {
  return TOPICS[currentTopicId];
}

// ─────────────────────────────────────────────
// 초기화 (kakaoReady race condition 방어)
// ─────────────────────────────────────────────
function initApp() {
  console.log('[ScienceCoLab] initApp 시작 — 카카오맵 생성');
  const container = document.getElementById('map');
  map = new kakao.maps.Map(container, {
    center: new kakao.maps.LatLng(37.5665, 126.9780),
    level: 9
  });

  // 줌 레벨에 따라 마커 크기 자동 조정
  kakao.maps.event.addListener(map, 'zoom_changed', updateMarkerScale);
  updateMarkerScale();

  renderTopicChips();
  renderAuthArea();
  updateFabVisibility();
  // 생태지도 위치 찍기용 지도 클릭 리스너 (pickingLocation일 때만 동작)
  kakao.maps.event.addListener(map, 'click', onMapClickForPick);
  loadData();
}

// ─────────────────────────────────────────────
// 로그인 세션 (sessionStorage) — 학교 비번 + 본인 입력 기반
// 신뢰 모델: 학교 단위 공유 비번, 제출 시 서버 재검증. (CLAUDE.md 보안 모델 참조)
// ─────────────────────────────────────────────
const SESSION_KEY = 'scl_session';

function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); }
  catch (e) { return null; }
}
function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); renderAuthArea(); updateFabVisibility(); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); renderAuthArea(); updateFabVisibility(); }
function isLoggedIn() { return !!getSession(); }

function renderAuthArea() {
  const s = getSession();
  const loginBtn = document.getElementById('loginBtn');
  const userWrap = document.getElementById('authUser');
  const userText = document.getElementById('authUserText');
  if (!loginBtn || !userWrap) return;
  if (s) {
    loginBtn.hidden = true;
    userWrap.hidden = false;
    if (userText) userText.textContent = `${s.school} · ${s.studentName}${s.topic ? ` · ${s.topic}` : ''}`;
  } else {
    loginBtn.hidden = false;
    userWrap.hidden = true;
    if (userText) userText.textContent = '';
  }
}

function openLoginModal() {
  populateTopicOptions('login-topic');
  populateSchoolOptions('login-school');
  document.getElementById('loginBackdrop').classList.add('open');
}

// 로그인 주제 드롭다운: 제출 가능한(input:true) 주제 목록. 기본값=현재 보고 있는 주제.
function populateTopicOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const inputTopics = Object.values(TOPICS).filter(t => t.input);
  select.innerHTML = '<option value="">주제를 선택하세요</option>' +
    inputTopics.map(t => `<option value="${escapeAttr(t.id)}">${escapeHtml(t.label)}</option>`).join('');
  const cur = currentTopic();
  if (cur && cur.input) select.value = cur.id;
}
function closeLoginModal() {
  document.getElementById('loginBackdrop').classList.remove('open');
  const f = document.getElementById('loginForm');
  if (f) f.reset();
}

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('loginSubmitBtn');
  const fd = new FormData(e.target);
  const topicId = fd.get('topic');
  const topicObj = TOPICS[topicId];
  if (!topicObj) { showToast('주제를 선택해 주세요.', 'error'); return; }
  const cred = {
    topicId: topicObj.id,
    topic: topicObj.apiTopic,          // 명부 대조·제출용 주제명 (예: '열섬')
    school: fd.get('school'),
    studentId: fd.get('studentId'),
    studentName: fd.get('studentName'),
    password: fd.get('password')
  };
  if (!cred.school) { showToast('학교를 선택해 주세요.', 'error'); return; }

  btn.disabled = true;
  btn.textContent = '확인 중...';
  try {
    // 시연 모드: 백엔드 검증 없이 로그인
    if (typeof MOCK_MODE !== 'undefined' && MOCK_MODE) {
      setSession(cred);
      showToast('시연 모드: 로그인되었습니다 (검증 생략)', 'success');
      closeLoginModal();
      switchTopic(cred.topicId);
      return;
    }
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'login',
        topic: cred.topic,
        school: cred.school,
        studentId: cred.studentId,
        studentName: cred.studentName,
        password: cred.password
      })
    });
    const result = await res.json();
    if (!result.ok) {
      showToast(result.error || '로그인에 실패했습니다.', 'error');
      return;
    }
    setSession(cred);
    showToast('로그인되었습니다 ✓', 'success');
    closeLoginModal();
    switchTopic(cred.topicId);          // 로그인한 주제 지도로 전환
  } catch (err) {
    console.error(err);
    showToast('네트워크 오류로 로그인에 실패했습니다.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '로그인';
  }
}

function logout() {
  clearSession();
  showToast('로그아웃되었습니다.', '');
}

// FAB(+) 클릭: 로그인 확인 → 주제별 입력 시작
function onFabClick() {
  const topic = currentTopic();
  if (!topic.input) return;
  if (!isLoggedIn()) {
    showToast('먼저 로그인해 주세요.', 'error');
    openLoginModal();
    return;
  }
  if (topic.pointMode) {
    startEcoInput();   // 생태지도: 지도에서 위치 먼저 찍기
  } else {
    openModal();       // 집계형(열섬 등): 바로 설문 모달
  }
}

// ─────────────────────────────────────────────
// 현재 위치로 이동 (브라우저 Geolocation)
// ─────────────────────────────────────────────
let myLocOverlay = null;

function onLocateClick() {
  if (!navigator.geolocation) {
    showToast('이 브라우저는 위치 기능을 지원하지 않습니다.', 'error');
    return;
  }
  if (!map) return;
  const btn = document.getElementById('locateBtn');
  if (btn) btn.classList.add('loading');

  navigator.geolocation.getCurrentPosition(
    pos => {
      if (btn) btn.classList.remove('loading');
      const loc = new kakao.maps.LatLng(pos.coords.latitude, pos.coords.longitude);
      map.setCenter(loc);
      if (map.getLevel() > 6) map.setLevel(5);   // 너무 멀면 적당히 확대
      showMyLocation(loc);
    },
    err => {
      if (btn) btn.classList.remove('loading');
      const msg = err.code === err.PERMISSION_DENIED
        ? '위치 접근이 거부되었습니다. 브라우저 권한을 확인해 주세요.'
        : '현재 위치를 가져오지 못했습니다.';
      showToast(msg, 'error');
    },
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
  );
}

// 현재 위치 파란 점 표시 (한 개만 유지)
function showMyLocation(loc) {
  if (myLocOverlay) myLocOverlay.setMap(null);
  const dot = document.createElement('div');
  dot.className = 'my-loc-dot';
  myLocOverlay = new kakao.maps.CustomOverlay({ position: loc, content: dot, zIndex: 6 });
  myLocOverlay.setMap(map);
}

// 앱 입력(FAB)은 input:true 주제(생태지도)에서만 표시
function updateFabVisibility() {
  const fab = document.getElementById('fab');
  if (!fab) return;
  const topic = currentTopic();
  const s = getSession();
  // 로그인 상태면 등록한 주제에서만 제출 버튼 노출 (다른 주제는 뷰어). 비로그인이면 input 주제에 노출(클릭 시 로그인 유도).
  const show = topic.input && (!s || s.topic === topic.apiTopic);
  fab.style.display = show ? '' : 'none';
}

// 카카오맵 줌 레벨: 1(가장 확대) ~ 14(가장 축소)
function updateMarkerScale() {
  if (!map) return;
  const level = map.getLevel();
  let scale;
  if (level <= 3)       scale = 1.15;  // 매우 가깝게 (도로/건물 단위)
  else if (level <= 6)  scale = 1.00;  // 가까움 (동/구 단위)
  else if (level <= 9)  scale = 0.85;  // 기본 (시 단위)
  else if (level <= 11) scale = 0.70;  // 멀리 (광역시/도 단위)
  else                  scale = 0.55;  // 매우 멀리 (전국)

  document.documentElement.style.setProperty('--marker-scale', scale);
}

// 이미 카카오 SDK가 로드되어 있으면 즉시 초기화, 아니면 이벤트 대기
if (window.kakao && window.kakao.maps && typeof kakao.maps.LatLng === 'function') {
  console.log('[ScienceCoLab] 카카오 SDK 이미 준비됨');
  initApp();
} else {
  console.log('[ScienceCoLab] kakaoReady 이벤트 대기...');
  window.addEventListener('kakaoReady', initApp);

  // 안전망: 5초 안에 이벤트가 안 오면 폴링으로 확인
  let attempts = 0;
  const pollTimer = setInterval(() => {
    attempts++;
    if (window.kakao && window.kakao.maps && typeof kakao.maps.LatLng === 'function') {
      clearInterval(pollTimer);
      if (!map) {
        console.warn('[ScienceCoLab] kakaoReady 이벤트 누락, 폴링으로 초기화');
        initApp();
      }
    } else if (attempts > 50) {
      clearInterval(pollTimer);
      console.error('[ScienceCoLab] 카카오 SDK 로드 실패 — JS 키나 도메인 등록 확인');
      const loading = document.getElementById('loading');
      if (loading) loading.textContent = '카카오맵을 불러오지 못했습니다. (키/도메인 확인)';
    }
  }, 200);
}

// ─────────────────────────────────────────────
// 주제 칩 (지도 위 주제 전환)
// ─────────────────────────────────────────────
function renderTopicChips() {
  const nav = document.getElementById('topicChips');
  if (!nav) return;
  nav.innerHTML = Object.values(TOPICS).map(t =>
    `<button type="button" class="topic-chip${t.id === currentTopicId ? ' active' : ''}" data-topic="${t.id}">${t.icon} ${escapeHtml(t.label)}</button>`
  ).join('');
}

document.addEventListener('click', (e) => {
  const chip = e.target.closest('.topic-chip');
  if (chip && chip.dataset.topic) switchTopic(chip.dataset.topic);
});

function switchTopic(id) {
  if (!TOPICS[id] || id === currentTopicId) return;
  cancelEcoInput();        // 위치 찍기 중이었다면 취소
  currentTopicId = id;
  renderTopicChips();
  updateFabVisibility();
  closeSidebar();
  loadData();
}

// ─────────────────────────────────────────────
// 데이터 로드 + 마커 렌더링
// ─────────────────────────────────────────────
async function loadData(force = false) {
  const topic = currentTopic();
  const loading = document.getElementById('loading');

  // 시연 모드 (?mock=1): 백엔드 없이 가상 데이터로 렌더링
  if (typeof MOCK_MODE !== 'undefined' && MOCK_MODE) {
    const mock = MOCK_DATA[topic.apiTopic];
    if (topic.pointMode) {
      observationsData = (mock && mock.observations) || [];
      schoolNames = (mock && mock.schools) || [];
      renderPointMarkers(observationsData);
    } else {
      schoolsData = (mock && mock.schools) || [];
      renderMarkers(schoolsData);
    }
    loading.style.display = 'none';
    return;
  }

  if (!force && topicDataCache[topic.id]) {
    if (topic.pointMode) {
      observationsData = topicDataCache[topic.id];
      renderPointMarkers(observationsData);
    } else {
      schoolsData = topicDataCache[topic.id];
      renderMarkers(schoolsData);
    }
    loading.style.display = 'none';
    return;
  }

  loading.style.display = 'block';
  loading.textContent = '데이터를 불러오는 중...';

  try {
    const url = `${CONFIG.GAS_API_URL}?topic=${encodeURIComponent(topic.apiTopic)}`;
    const res = await fetch(url);
    const data = await res.json();

    if (Array.isArray(data)) {
      // 구버전 백엔드가 topic 파라미터를 무시하고 기존 데이터를 반환한 경우
      throw new Error('백엔드가 아직 새 버전으로 배포되지 않았습니다. (관리자: GAS 재배포 필요)');
    }
    if (!data || data.topic !== topic.apiTopic) {
      throw new Error((data && data.error) || '데이터 형식이 올바르지 않습니다');
    }

    if (topic.pointMode) {
      if (!Array.isArray(data.observations)) {
        throw new Error(data.error || '관찰 데이터 형식이 올바르지 않습니다');
      }
      topicDataCache[topic.id] = data.observations;
      observationsData = data.observations;
      schoolNames = Array.isArray(data.schools) ? data.schools : [];
      renderPointMarkers(data.observations);
    } else {
      if (!Array.isArray(data.schools)) {
        throw new Error(data.error || '데이터 형식이 올바르지 않습니다');
      }
      topicDataCache[topic.id] = data.schools;
      schoolsData = data.schools;
      renderMarkers(data.schools);
    }
    loading.style.display = 'none';
  } catch (err) {
    console.error(err);
    loading.style.display = 'block';
    loading.textContent = err.message || '데이터를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }
}

// 지도에서 모든 마커/클러스터 제거
function clearAllMarkers() {
  markers.forEach(m => m.setMap(null));
  markers = [];
  if (clusterer) { clusterer.clear(); clusterer.setMap(null); clusterer = null; }
}

// 생태지도(pointMode): 관찰마다 개별 핀 + 클러스터
function renderPointMarkers(observations) {
  clearAllMarkers();
  if (!observations || !observations.length) return;

  const topic = currentTopic();
  const bounds = new kakao.maps.LatLngBounds();
  const image = ecoMarkerImage();

  observations.forEach(obs => {
    if (obs.lat == null || obs.lng == null || isNaN(obs.lat) || isNaN(obs.lng)) return;
    const pos = new kakao.maps.LatLng(obs.lat, obs.lng);
    const marker = new kakao.maps.Marker({
      position: pos,
      image: image,
      title: topic.marker.label ? topic.marker.label(obs) : ''
    });
    kakao.maps.event.addListener(marker, 'click', () => {
      openSidebar({ school: obs.species || '관찰 기록', lat: obs.lat, lng: obs.lng, measurements: [obs] });
    });
    markers.push(marker);
    bounds.extend(pos);
  });

  clusterer = new kakao.maps.MarkerClusterer({
    map: map,
    averageCenter: true,
    minLevel: 5,
    gridSize: 70,
    disableClickZoom: false
  });
  clusterer.addMarkers(markers);

  if (markers.length === 1) map.setCenter(bounds.getSouthWest());
  else if (markers.length > 1) map.setBounds(bounds);
}

// 생태 관찰 핀 이미지 (초록 물방울 + 흰 점)
function ecoMarkerImage() {
  const svg =
    "<svg xmlns='http://www.w3.org/2000/svg' width='30' height='40' viewBox='0 0 30 40'>" +
    "<path d='M15 0C7 0 .8 6.3.8 14.2.8 24.8 15 40 15 40s14.2-15.2 14.2-25.8C29.2 6.3 23 0 15 0z' fill='#3d8b40'/>" +
    "<circle cx='15' cy='14.5' r='6' fill='#ffffff'/></svg>";
  return new kakao.maps.MarkerImage(
    'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    new kakao.maps.Size(30, 40),
    { offset: new kakao.maps.Point(15, 40) }
  );
}

function renderMarkers(schools) {
  clearAllMarkers();

  // 측정 데이터가 있는 학교만 마커 표시 (데이터 없으면 지도에 안 뜸)
  const withData = (schools || []).filter(s => (s.measurements || []).length > 0);
  if (!withData.length) return;

  const topic = currentTopic();
  const bounds = new kakao.maps.LatLngBounds();
  const positions = [];

  withData.forEach(school => {
    const pos = new kakao.maps.LatLng(school.lat, school.lng);
    positions.push(pos);

    const records = school.measurements || [];
    const count = records.length;

    // 주제 대표값 (학교 평균) + 값에 따른 마커 색상
    const vals = records
      .map(r => r[topic.marker.key])
      .filter(v => v !== null && v !== undefined && !isNaN(v));
    const value = vals.length ? avg(vals) : null;
    const color = value !== null ? colorForValue(topic.marker.scale, value) : null;

    const el = document.createElement('div');
    el.className = 'school-marker';
    el.innerHTML = `
      <div class="sm-pin">
        <span class="sm-icon">🏫</span>
        <span class="sm-name">${escapeHtml(school.school)}</span>
        ${value !== null ? `<span class="sm-value">${escapeHtml(topic.marker.format(value))}</span>` : ''}
        ${count > 0 ? `<span class="sm-count">${count}</span>` : ''}
      </div>
      <div class="sm-tail"></div>
    `;
    if (color) {
      el.querySelector('.sm-pin').style.background = color;
      el.querySelector('.sm-tail').style.borderTopColor = color;
      const cnt = el.querySelector('.sm-count');
      if (cnt) cnt.style.color = color;
    }
    el.addEventListener('click', () => openSidebar(school));

    const overlay = new kakao.maps.CustomOverlay({
      position: pos,
      content: el,
      yAnchor: 1,
      xAnchor: 0.5,
      clickable: true
    });
    overlay.setMap(map);
    bounds.extend(pos);
    markers.push(overlay);
  });

  if (markers.length === 1) {
    map.setCenter(positions[0]);
  } else {
    map.setBounds(bounds);
  }
}

// 값 → 마커 색상 (linear: 두 색 보간 / steps: 등급 구간)
function colorForValue(scale, v) {
  if (scale.type === 'steps') {
    for (const s of scale.steps) {
      if (v <= s.max) return s.color;
    }
    return scale.steps[scale.steps.length - 1].color;
  }
  const t = Math.min(1, Math.max(0, (v - scale.min) / (scale.max - scale.min)));
  const a = hexToRgb(scale.from);
  const b = hexToRgb(scale.to);
  const mix = a.map((c, i) => Math.round(c + (b[i] - c) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
}

// ─────────────────────────────────────────────
// 사이드바
// ─────────────────────────────────────────────
function openSidebar(school) {
  const topic = currentTopic();
  const sidebar = document.getElementById('sidebar');
  const records = school.measurements || [];
  const latest = records[0];

  // 사이드바 상태 초기화 (학교 바뀔 때마다 리셋)
  sidebarState = { school };

  document.getElementById('sb-school').textContent = school.school;

  // 주제별 차트 표시 여부 (막대: groupBy 또는 barMode 'metrics' / 꺾은선: chartMetrics 존재)
  const hasBar = !!(topic.groupBy || topic.barMode === 'metrics') && (topic.chartMetrics || []).length > 0;
  const hasLine = (topic.chartMetrics || []).length > 0;
  const barBox = document.getElementById('chart-bar-box');
  const lineBox = document.getElementById('chart-line-box');
  const vizTitle = document.getElementById('sb-viz-title');
  if (barBox) barBox.style.display = hasBar ? '' : 'none';
  if (lineBox) lineBox.style.display = hasLine ? '' : 'none';
  if (vizTitle) vizTitle.style.display = (hasBar || hasLine) ? '' : 'none';

  // 주제별 섹션 제목 / 특이사항 표시 여부
  document.getElementById('sb-env-title').textContent = topic.envTitle;
  const showNotes = !!topic.hasNotes;
  document.getElementById('sb-notes-title').style.display = showNotes ? '' : 'none';
  document.getElementById('sb-notes').style.display = showNotes ? '' : 'none';

  if (records.length === 0) {
    document.getElementById('sb-meta').textContent =
      '아직 측정 기록이 없습니다 · Google Forms로 제출하면 이곳에 표시됩니다';
    showSelectedRecord(null);
    renderLineChart([]);
    renderChart([]);
  } else if (topic.pointMode) {
    // 생태지도: 관찰 한 건 (제목=생명체, 메타=학교·날짜)
    document.getElementById('sb-meta').textContent =
      [latest.school, latest.date].filter(Boolean).join(' · ');
    showSelectedRecord(latest);
    renderLineChart([]);
    renderChart([]);
  } else {
    const when = `${latest.date || ''} ${latest.time || ''}`.trim();
    document.getElementById('sb-meta').textContent =
      (when ? `최근: ${when} · ` : '') + `총 ${records.length}건`;
    showSelectedRecord(latest); // 기본은 가장 최근 측정 (차트 점 클릭 시 갱신)
    renderLineChart(records);
    renderChart(records);
  }

  sidebar.classList.add('open');
}

// ─────────────────────────────────────────────
// 라이트박스 (사진 클릭 시 큰 이미지 팝업)
// ─────────────────────────────────────────────
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('open');
}

function closeLightbox(e) {
  // 이미지 자체 클릭은 무시 (배경/X 버튼 클릭 시에만 닫힘)
  if (e && e.target && e.target.tagName === 'IMG') return;
  document.getElementById('lightbox').classList.remove('open');
}

// ESC 키로 라이트박스 닫기
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('lightbox').classList.remove('open');
  }
});

// 클릭 위임: data-lightbox 이미지 → 라이트박스 열기
document.addEventListener('click', (e) => {
  const lbTarget = e.target.closest('[data-lightbox]');
  if (lbTarget) {
    e.preventDefault();
    openLightbox(lbTarget.dataset.lightbox);
  }
});

function closeSidebar() {
  document.getElementById('sidebar').classList.remove('open');
}

// 차트 축 구성: 주제 지표들이 공유하는 y축 (+ legacy 기온·습도만 y1 보조축)
function buildChartScales(metrics, withXTicks) {
  const scales = {
    y: {
      type: 'linear',
      position: 'left',
      title: {
        display: true,
        text: (metrics.find(m => (m.axis || 'y') === 'y') || metrics[0]).unit,
        font: { size: 10 }
      }
    }
  };
  const y1Metric = metrics.find(m => m.axis === 'y1');
  if (y1Metric) {
    scales.y1 = {
      type: 'linear',
      position: 'right',
      title: { display: true, text: y1Metric.unit, font: { size: 10 } },
      grid: { drawOnChartArea: false }
    };
  }
  if (withXTicks) {
    scales.x = { ticks: { font: { size: 10 }, maxRotation: 0, autoSkipPadding: 12 } };
  }
  return scales;
}

// ─────────────────────────────────────────────
// 꺾은선 그래프: 시간순 추이 + 클릭 시 상세
// ─────────────────────────────────────────────
function renderLineChart(records) {
  const canvas = document.getElementById('dataChartLine');
  if (lineChartInstance) {
    lineChartInstance.destroy();
    lineChartInstance = null;
  }
  if (!records.length) return;

  const topic = currentTopic();
  const metrics = topic.chartMetrics || [];
  if (!metrics.length) return; // 꺾은선 없는 주제(예: 미세먼지)

  // 시간 오름차순으로 정렬한 사본
  const sorted = [...records].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const labels = sorted.map(r => `${(r.date || '').slice(5)} ${r.time || ''}`.trim()); // MM-DD HH:mm

  const datasets = metrics.map(m => ({
    label: m.label,
    data: sorted.map(r => {
      const v = r[m.key];
      return (v === null || v === undefined || isNaN(v)) ? null : v;
    }),
    borderColor: m.color,
    backgroundColor: hexToRgba(m.color, 0.15),
    tension: 0.3,
    pointRadius: 5,
    pointHoverRadius: 7,
    pointBackgroundColor: m.color,
    yAxisID: m.axis || 'y',
    spanGaps: true
  }));

  lineChartInstance = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      interaction: { mode: 'index', intersect: false },
      onClick: (evt, elements) => {
        if (elements && elements.length > 0) {
          const idx = elements[0].index;
          showSelectedRecord(sorted[idx]);
        }
      },
      plugins: {
        legend: { position: 'bottom', labels: { font: { size: 11 } } }
      },
      scales: buildChartScales(metrics, true)
    }
  });
}

// 선택된 측정 기록 → 헤더 + 태그/사진/특이사항/측정자 영역 갱신
function showSelectedRecord(record) {
  const topic = currentTopic();
  sidebarState.record = record;      // 수정/삭제 대상 추적
  renderRecordActions(record);       // 본인 기록이면 수정/삭제 버튼
  const $place = document.getElementById('sr-place');
  const $when  = document.getElementById('sr-when');
  const $stats = document.getElementById('sr-stats');
  const $env   = document.getElementById('sb-environment');
  const $photo = document.getElementById('sb-photos');
  const $notes = document.getElementById('sb-notes');
  const $auth  = document.getElementById('sb-author');

  $stats.classList.toggle('compact', topic.statFields.length > 2);

  if (!record) {
    $place.style.display = 'none';
    $when.style.display  = 'none';
    $stats.innerHTML   = '-';
    $env.innerHTML     = '';
    $photo.innerHTML   = '';
    $notes.textContent = '-';
    $auth.textContent  = '';
    return;
  }

  // 장소·일시가 없는 주제(예: 미세먼지)는 해당 줄을 숨김
  const whenStr = `${record.date || ''} ${record.time || ''}`.trim();
  $place.textContent   = record.location ? `📍 ${record.location}` : '';
  $place.style.display = record.location ? '' : 'none';
  $when.textContent    = whenStr;
  $when.style.display  = whenStr ? '' : 'none';
  $stats.innerHTML   = topic.statFields.map(f =>
    `<span class="sr-stat" style="color:${f.color}">${f.icon} ${formatNum(record[f.key])}${f.unit}</span>`
  ).join('');

  // 태그: 주제별 필드들을 모아 표시 (배열 필드는 펼치고, label이 있으면 접두)
  const tags = [];
  topic.tagFields.forEach(f => {
    const v = record[f.key];
    const push = x => {
      const s = String(x).trim();
      if (s) tags.push(f.label ? `${f.label}: ${s}` : s);
    };
    if (Array.isArray(v)) v.forEach(push);
    else if (v !== null && v !== undefined) push(v);
  });
  $env.innerHTML = tags.length
    ? tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')
    : '<span style="color:#aaa;font-size:12px;">-</span>';

  $photo.innerHTML = record.photoUrl
    ? `<img src="${escapeAttr(record.photoUrl)}" alt="" loading="lazy" data-lightbox="${escapeAttr(record.photoUrl)}" />`
    : '<div class="empty">사진 없음</div>';

  $notes.textContent = record.notes || '-';
  $auth.textContent  = record.studentName ? `— 측정자: ${record.studentName}` : '';
}

// 본인이 작성한 기록이면 수정/삭제 버튼 노출
function renderRecordActions(record) {
  const el = document.getElementById('sr-actions');
  if (!el) return;
  if (record && canModifyRecord(record)) {
    el.innerHTML =
      '<button type="button" class="sr-edit" onclick="startEditRecord()">✏️ 수정</button>' +
      '<button type="button" class="sr-delete" onclick="deleteSelectedRecord()">🗑 삭제</button>';
    el.style.display = '';
  } else {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}

// ─────────────────────────────────────────────
// 차트: 그룹(장소/재질 등)별 평균 비교
// ─────────────────────────────────────────────
function renderChart(records) {
  const canvas = document.getElementById('dataChart');
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
  }

  const topic = currentTopic();
  const metrics = topic.chartMetrics || [];
  const isMetricsBar = topic.barMode === 'metrics';
  const hasBar = (topic.groupBy || isMetricsBar) && metrics.length > 0;
  if (!hasBar) return; // 막대 없는 주제(예: 미세먼지)

  const title = isMetricsBar ? (topic.barTitle || '평균') : topic.groupBy.title;
  const barTitle = document.getElementById('chart-bar-title');
  if (barTitle) barTitle.textContent = `📊 ${title}`;

  if (!records.length) return;

  let labels, datasets, showLegend;

  if (isMetricsBar) {
    // chartMetrics 각각을 막대 하나로 (예: 탄소배출 종이/플라스틱/캔/일반)
    labels = metrics.map(m => m.label);
    datasets = [{
      label: title,
      data: metrics.map(m => avg(
        records.map(r => r[m.key]).filter(v => v !== null && v !== undefined && !isNaN(v))
      )),
      backgroundColor: metrics.map(m => hexToRgba(m.color, 0.75)),
      borderRadius: 6,
      yAxisID: 'y'
    }];
    showLegend = false;
  } else {
    // groupBy 필드별 평균 (지표들을 시리즈로)
    const groups = {};
    records.forEach(r => {
      const key = r[topic.groupBy.key] || '기타';
      if (!groups[key]) groups[key] = metrics.map(() => []);
      metrics.forEach((m, i) => {
        const v = r[m.key];
        if (v !== null && v !== undefined && !isNaN(v)) groups[key][i].push(v);
      });
    });
    labels = Object.keys(groups);
    datasets = metrics.map((m, i) => ({
      label: m.label,
      data: labels.map(k => avg(groups[k][i])),
      backgroundColor: hexToRgba(m.color, 0.7),
      borderRadius: 6,
      yAxisID: m.axis || 'y'
    }));
    showLegend = metrics.length > 1;
  }

  chartInstance = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets },
    options: {
      responsive: true,
      plugins: {
        legend: { display: showLegend, position: 'bottom', labels: { font: { size: 11 } } },
        title: {
          display: true,
          text: title,
          font: { size: 12, weight: '700' },
          color: '#4a5670'
        }
      },
      scales: buildChartScales(metrics, false)
    }
  });
}

// ─────────────────────────────────────────────
// 생태지도 입력: 지도에서 위치 찍기 → 모달
// ─────────────────────────────────────────────
function startEcoInput() {
  if (!currentTopic().input) return;
  pickingLocation = true;
  const banner = document.getElementById('pickBanner');
  if (banner) banner.classList.add('show');
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = 'crosshair';
}

function cancelEcoInput() {
  pickingLocation = false;
  const banner = document.getElementById('pickBanner');
  if (banner) banner.classList.remove('show');
  const mapEl = document.getElementById('map');
  if (mapEl) mapEl.style.cursor = '';
}

// 지도 클릭 리스너 (initApp에서 등록). pickingLocation일 때만 좌표 캡처.
function onMapClickForPick(mouseEvent) {
  if (!pickingLocation) return;
  const latlng = mouseEvent.latLng;
  pickedLatLng = { lat: latlng.getLat(), lng: latlng.getLng() };
  if (tempPin) tempPin.setMap(null);
  tempPin = new kakao.maps.Marker({ position: latlng, image: ecoMarkerImage(), map: map, zIndex: 5 });
  cancelEcoInput();
  openModal();
}

function repickEcoLocation() {
  document.getElementById('modalBackdrop').classList.remove('open');
  startEcoInput();
}

// ─────────────────────────────────────────────
// 입력 모달 — currentTopic().inputFields 기준으로 본문 동적 렌더
// ─────────────────────────────────────────────
let editingRecord = null;   // 수정 중이면 대상 record, 신규 제출이면 null

function openModal() {
  editingRecord = null;
  const topic = currentTopic();
  renderModalIdentity();
  renderModalFields(topic);
  prefillDate();
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.textContent = '제출';
  if (topic.pointMode && pickedLatLng) {
    const latEl = document.getElementById('f-lat');
    const lngEl = document.getElementById('f-lng');
    const coordText = document.getElementById('f-coord-text');
    if (latEl) latEl.value = pickedLatLng.lat;
    if (lngEl) lngEl.value = pickedLatLng.lng;
    if (coordText) coordText.textContent = `${pickedLatLng.lat.toFixed(5)}, ${pickedLatLng.lng.toFixed(5)}`;
  }
  document.getElementById('modalBackdrop').classList.add('open');
}

// 수정 모달: 기존 record 값으로 폼을 채워 연다.
function openModalForEdit(record) {
  const topic = currentTopic();
  editingRecord = record;
  renderModalIdentity();
  renderModalFields(topic);
  prefillFields(record);
  const title = document.getElementById('modalTitle');
  if (title) title.textContent = '✏️ 기록 수정';
  const submitBtn = document.getElementById('submitBtn');
  if (submitBtn) submitBtn.textContent = '수정 저장';
  // 생태지도: 좌표는 수정하지 않고 기존 위치를 그대로 표시 (사진 위 재첨부는 선택)
  if (topic.pointMode) {
    const coordText = document.getElementById('f-coord-text');
    if (coordText && record.lat != null && record.lng != null) {
      coordText.textContent = `${Number(record.lat).toFixed(5)}, ${Number(record.lng).toFixed(5)}`;
    }
  }
  document.getElementById('modalBackdrop').classList.add('open');
}

// record 값으로 모달 필드 채우기 (사진 제외 — 파일 input은 프리필 불가)
function prefillFields(record) {
  const topic = currentTopic();
  (topic.inputFields || []).forEach(f => {
    if (f.type === 'coord' || f.type === 'photo') return;
    const val = record[f.key];
    if (f.type === 'checkbox') {
      const set = new Set(Array.isArray(val) ? val.map(String) : (val ? [String(val)] : []));
      document.querySelectorAll(`#modalFields input[name="${cssEscape(f.key)}"]`).forEach(cb => {
        cb.checked = set.has(cb.value);
      });
    } else {
      const el = document.querySelector(`#modalFields [name="${cssEscape(f.key)}"]`);
      if (el) el.value = (val === null || val === undefined) ? '' : val;
    }
  });
}

// name 속성 셀렉터용 최소 이스케이프 (필드 키는 영문이라 실제로는 그대로지만 방어)
function cssEscape(s) {
  return String(s).replace(/["\\]/g, '\\$&');
}

function closeModal() {
  closeCamera();   // 열려 있던 카메라 스트림 정리
  document.getElementById('modalBackdrop').classList.remove('open');
  editingRecord = null;
  const form = document.getElementById('submitForm');
  if (form) form.reset();
  const preview = document.getElementById('photoPreview');
  if (preview) { preview.classList.remove('show'); preview.removeAttribute('src'); }
  if (tempPin) { tempPin.setMap(null); tempPin = null; }
  pickedLatLng = null;
}

// 로그인한 신원 요약 (학교·학번·이름) — 폼에서 재입력 없이 세션값 사용
function renderModalIdentity() {
  const el = document.getElementById('modalIdentity');
  if (!el) return;
  const s = getSession();
  el.innerHTML = s
    ? `제출자: <strong>${escapeHtml(s.school)}</strong> · ${escapeHtml(s.studentId)} ${escapeHtml(s.studentName)}`
    : '';
}

function renderModalFields(topic) {
  const title = document.getElementById('modalTitle');
  if (title) title.textContent = topic.inputTitle || (topic.label + ' 기록');
  const container = document.getElementById('modalFields');
  if (container) container.innerHTML = (topic.inputFields || []).map(renderField).join('');
}

// 입력 스키마 필드 1개 → HTML
function renderField(f) {
  const req = f.required ? ' <em>*</em>' : '';
  const note = f.optionalNote ? ` <span class="opt">${escapeHtml(f.optionalNote)}</span>` : '';

  if (f.type === 'coord') {
    return `<div class="picked-coord">
        <span>📍 찍은 위치: <strong id="f-coord-text">-</strong></span>
        <button type="button" class="btn-link" onclick="repickEcoLocation()">지도에서 다시 찍기</button>
        <input type="hidden" name="lat" id="f-lat" />
        <input type="hidden" name="lng" id="f-lng" />
      </div>`;
  }

  const label = `<span>${escapeHtml(f.label)}${req}${note}</span>`;

  if (f.type === 'select') {
    const opts = ['<option value="">선택하세요</option>']
      .concat((f.options || []).map(o => `<option value="${escapeAttr(o)}">${escapeHtml(o)}</option>`))
      .join('');
    return `<label>${label}<select name="${escapeAttr(f.key)}"${f.required ? ' required' : ''}>${opts}</select></label>`;
  }

  if (f.type === 'checkbox') {
    const boxes = (f.options || []).map(o =>
      `<label class="cb"><input type="checkbox" name="${escapeAttr(f.key)}" value="${escapeAttr(o)}" /> ${escapeHtml(o)}</label>`
    ).join('');
    return `<div class="field-group">
        <span class="field-group-label">${escapeHtml(f.label)}${req}</span>
        <div class="cb-list">${boxes}</div>
      </div>`;
  }

  if (f.type === 'photo') {
    return `<div class="photo-field">
        <span>${escapeHtml(f.label)}${req}</span>
        <div class="photo-actions">
          <button type="button" class="btn-camera" onclick="openCamera()">📷 촬영하기</button>
          <label class="btn-file">🖼 사진 선택
            <input type="file" name="photo" id="f-photo" accept="image/*"${f.required ? ' required' : ''} />
          </label>
        </div>
        <img id="photoPreview" class="photo-preview" alt="" />
      </div>`;
  }

  // text / number / date / time
  const t = (f.type === 'number' || f.type === 'date' || f.type === 'time') ? f.type : 'text';
  const attrs = [`type="${t}"`, `name="${escapeAttr(f.key)}"`];
  if (f.required) attrs.push('required');
  if (f.maxlength !== undefined) attrs.push(`maxlength="${f.maxlength}"`);
  if (f.min !== undefined) attrs.push(`min="${f.min}"`);
  if (f.max !== undefined) attrs.push(`max="${f.max}"`);
  if (f.step !== undefined) attrs.push(`step="${f.step}"`);
  if (f.placeholder) attrs.push(`placeholder="${escapeAttr(f.placeholder)}"`);
  if (f.key === 'date') attrs.push('id="f-date"');
  return `<label>${label}<input ${attrs.join(' ')} /></label>`;
}

function populateSchoolOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  const current = select.value;
  const names = (schoolNames && schoolNames.length) ? schoolNames : schoolsData.map(s => s.school);
  select.innerHTML = '<option value="">학교를 선택하세요</option>' +
    names.map(n => `<option value="${escapeAttr(n)}">${escapeHtml(n)}</option>`).join('');
  if (current) select.value = current;
}

function prefillDate() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const el = document.getElementById('f-date');
  if (el) el.value = `${now.getFullYear()}-${mm}-${dd}`;
}

// 사진 미리보기
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'f-photo') {
    const file = e.target.files[0];
    showPhotoPreview(file);
  }
});

function showPhotoPreview(file) {
  const preview = document.getElementById('photoPreview');
  if (!preview) return;
  if (!file) { preview.classList.remove('show'); return; }
  const reader = new FileReader();
  reader.onload = ev => {
    preview.src = ev.target.result;
    preview.classList.add('show');
  };
  reader.readAsDataURL(file);
}

// ─────────────────────────────────────────────
// 즉석 촬영 (getUserMedia) — 데스크톱·모바일 모두 앱 안에서 촬영
// 촬영 결과를 #f-photo 파일 input에 주입해 기존 제출 로직을 그대로 사용
// ─────────────────────────────────────────────
let cameraStream = null;

async function openCamera() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('이 브라우저는 카메라를 지원하지 않습니다. "사진 선택"을 이용해 주세요.', 'error');
    return;
  }
  const overlay = document.getElementById('cameraOverlay');
  const video = document.getElementById('cameraVideo');
  try {
    // 후면 카메라 우선 (모바일). 데스크톱은 기본 웹캠.
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false
    });
    video.srcObject = cameraStream;
    overlay.classList.add('open');
  } catch (err) {
    console.error(err);
    const msg = (err && err.name === 'NotAllowedError')
      ? '카메라 접근이 거부되었습니다. 브라우저 권한을 확인해 주세요.'
      : '카메라를 열지 못했습니다. "사진 선택"을 이용해 주세요.';
    showToast(msg, 'error');
    stopCameraStream();
  }
}

function stopCameraStream() {
  if (cameraStream) {
    cameraStream.getTracks().forEach(t => t.stop());
    cameraStream = null;
  }
  const video = document.getElementById('cameraVideo');
  if (video) video.srcObject = null;
}

function closeCamera() {
  stopCameraStream();
  const overlay = document.getElementById('cameraOverlay');
  if (overlay) overlay.classList.remove('open');
}

function captureCameraPhoto() {
  const video = document.getElementById('cameraVideo');
  const canvas = document.getElementById('cameraCanvas');
  if (!video || !video.videoWidth) { showToast('카메라 준비 중입니다. 잠시 후 다시 눌러주세요.', 'error'); return; }

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

  canvas.toBlob(blob => {
    if (!blob) { showToast('촬영에 실패했습니다.', 'error'); return; }
    const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
    // 파일 input에 주입 (제출 시 fd.get('photo')로 읽힘)
    const input = document.getElementById('f-photo');
    if (input) {
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
    }
    showPhotoPreview(file);
    closeCamera();
  }, 'image/jpeg', 0.92);
}

// 제출 핸들러 (모든 input:true 주제 공통) — 세션 신원 + 스키마 필드로 payload 구성
async function handleSubmit(e) {
  e.preventDefault();
  const form = e.target;
  const topic = currentTopic();
  const submitBtn = document.getElementById('submitBtn');

  const session = getSession();
  if (!session) {
    showToast('로그인이 필요합니다.', 'error');
    openLoginModal();
    return;
  }

  const fd = new FormData(form);
  const isEdit = !!editingRecord;

  // pointMode(생태지도) 신규 제출은 좌표 필수 (수정은 기존 좌표 유지)
  if (topic.pointMode && !isEdit && !pickedLatLng) {
    showToast('지도에서 관찰 위치를 먼저 찍어주세요.', 'error');
    return;
  }

  // 세션 신원 + topic 기본 payload
  const payload = {
    topic: topic.apiTopic,
    school: session.school,
    password: session.password,
    studentId: session.studentId,
    studentName: session.studentName
  };
  if (isEdit) {
    payload.action = 'update';
    payload.timestamp = editingRecord.timestamp;   // 대상 기록 식별
  } else if (topic.pointMode && pickedLatLng) {
    payload.lat = pickedLatLng.lat;
    payload.lng = pickedLatLng.lng;
  }

  // 스키마 필드 수집
  let photoFile = null;
  (topic.inputFields || []).forEach(f => {
    if (f.type === 'coord') return;
    if (f.type === 'photo') { photoFile = fd.get('photo'); return; }
    if (f.type === 'checkbox') { payload[f.key] = fd.getAll(f.key); return; }
    payload[f.key] = fd.get(f.key);
  });

  // 사진 필수 검사 (수정 시엔 기존 사진 유지되므로 재첨부 강제하지 않음)
  const photoField = (topic.inputFields || []).find(f => f.type === 'photo');
  if (!isEdit && photoField && photoField.required && (!photoFile || !photoFile.size)) {
    showToast('사진을 첨부해 주세요.', 'error');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = isEdit ? '저장 중...' : '제출 중...';

  try {
    if (photoFile && photoFile.size) {
      const { base64, mimeType } = await resizeImage(photoFile, 1024, 0.85);
      payload.photoBase64 = base64;
      payload.photoMimeType = mimeType;
    }

    // 시연 모드: 백엔드 없이 화면에만 반영 (저장 안 됨)
    if (typeof MOCK_MODE !== 'undefined' && MOCK_MODE) {
      showToast('시연 모드: 저장되지 않습니다', 'success');
      if (topic.pointMode && !isEdit) {
        addMockObservation(payload);
        renderPointMarkers(observationsData);
      }
      closeModal();
      return;
    }

    // GAS는 application/json preflight를 처리하지 않으므로 text/plain으로 보냄
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (!result.ok) {
      showToast(result.error || (isEdit ? '수정에 실패했습니다.' : '제출에 실패했습니다.'), 'error');
    } else {
      showToast(isEdit ? '기록이 수정되었습니다 ✓' : '기록이 등록되었습니다 ✓', 'success');
      closeModal();
      if (isEdit) closeSidebar();
      await loadData(true); // 캐시 무시하고 새로 불러오기
    }
  } catch (err) {
    console.error(err);
    showToast('네트워크 오류로 처리에 실패했습니다.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = editingRecord ? '수정 저장' : '제출';
  }
}

// ─────────────────────────────────────────────
// 선택된 기록 수정 / 삭제 (작성 본인만 버튼 노출)
// ─────────────────────────────────────────────
// 로그인 신원이 기록 작성자(학교+학번+이름)와 일치하는가
function canModifyRecord(record) {
  const s = getSession();
  if (!s || !record) return false;
  return String(s.school) === String(record.school) &&
         String(s.studentId) === String(record.studentId) &&
         String(s.studentName) === String(record.studentName);
}

function startEditRecord() {
  const rec = sidebarState && sidebarState.record;
  if (!rec) return;
  if (!canModifyRecord(rec)) { showToast('본인이 작성한 기록만 수정할 수 있습니다.', 'error'); return; }
  openModalForEdit(rec);
}

async function deleteSelectedRecord() {
  const rec = sidebarState && sidebarState.record;
  if (!rec) return;
  if (!canModifyRecord(rec)) { showToast('본인이 작성한 기록만 삭제할 수 있습니다.', 'error'); return; }
  if (!window.confirm('이 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;

  const session = getSession();
  if (typeof MOCK_MODE !== 'undefined' && MOCK_MODE) {
    showToast('시연 모드: 삭제는 저장되지 않습니다', 'success');
    return;
  }
  try {
    const res = await fetch(CONFIG.GAS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({
        action: 'delete',
        topic: currentTopic().apiTopic,
        timestamp: rec.timestamp,
        school: session.school,
        password: session.password,
        studentId: session.studentId,
        studentName: session.studentName
      })
    });
    const result = await res.json();
    if (!result.ok) {
      showToast(result.error || '삭제에 실패했습니다.', 'error');
    } else {
      showToast('기록이 삭제되었습니다 ✓', 'success');
      closeSidebar();
      await loadData(true);
    }
  } catch (err) {
    console.error(err);
    showToast('네트워크 오류로 삭제에 실패했습니다.', 'error');
  }
}

// 시연 모드에서 제출한 관찰을 메모리에 추가 (사진은 미리보기 dataURL 사용)
function addMockObservation(p) {
  observationsData = observationsData.concat([{
    timestamp: new Date().toISOString(),
    school: p.school, studentId: p.studentId, studentName: p.studentName,
    lat: p.lat, lng: p.lng, date: p.date, location: p.location,
    species: p.species, count: Number(p.count),
    temp: p.temp ? Number(p.temp) : null,
    humidity: p.humidity ? Number(p.humidity) : null,
    photoUrl: 'data:' + p.photoMimeType + ';base64,' + p.photoBase64
  }]);
}

// ─────────────────────────────────────────────
// 사진 리사이즈 (Canvas → JPEG Base64)
// ─────────────────────────────────────────────
function resizeImage(file, maxSize = 1024, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          if (width >= height) {
            height = Math.round(height * (maxSize / width));
            width = maxSize;
          } else {
            width = Math.round(width * (maxSize / height));
            height = maxSize;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        // dataUrl: "data:image/jpeg;base64,xxxx" → base64 부분만 추출
        const base64 = dataUrl.split(',')[1];
        resolve({ base64, mimeType: 'image/jpeg' });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────
// 토스트
// ─────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = '') {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (type ? ' ' + type : '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = 'toast' + (type ? ' ' + type : '');
  }, 3000);
}

// ─────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────
function avg(arr) {
  if (!arr.length) return 0;
  return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
}
function formatNum(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return Number(n).toFixed(1).replace(/\.0$/, '');
}
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function hexToRgba(hex, alpha) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function escapeAttr(s) {
  return String(s ?? '').replace(/["'<>&]/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// 전역 노출 (HTML inline 핸들러용)
window.openModal = openModal;
window.closeModal = closeModal;
window.handleSubmit = handleSubmit;
window.closeSidebar = closeSidebar;
window.closeLightbox = closeLightbox;
window.onFabClick = onFabClick;
window.onLocateClick = onLocateClick;
window.openLoginModal = openLoginModal;
window.closeLoginModal = closeLoginModal;
window.handleLogin = handleLogin;
window.logout = logout;
window.repickEcoLocation = repickEcoLocation;
window.startEditRecord = startEditRecord;
window.deleteSelectedRecord = deleteSelectedRecord;
window.openCamera = openCamera;
window.closeCamera = closeCamera;
window.captureCameraPhoto = captureCameraPhoto;
