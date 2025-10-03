const canvas = document.getElementById('playfield');
const ctx = canvas.getContext('2d');

const PIXELS_PER_METER = 22;
const DT_TARGET = 1 / 60;
const MAX_STEER = degToRad(32);
const ACCEL_RATE = 440;
const BRAKE_RATE = 1040;
const DRAG = 1.7;
const ROLLING_RESIST = 80;
const WHEEL_BASE = 110;

// 트랙 설정
const TRACK = {
  // 둥근 사각형 외곽 트랙
  outer: {
    centerX: 480,
    centerY: 270,
    width: 820,    // 트랙 너비
    height: 360,   // 트랙 높이
    radius: 120,   // 모서리 반경
    lineWidth: 100,
  },
  // S자 코스 (내부)
  sCurve: {
    startX: 480,
    startY: 200,
    width: 80,
    segments: [
      // S자 경로 포인트들 (추후 정교하게 조정)
      { x: 480, y: 200 },
      { x: 420, y: 250 },
      { x: 380, y: 300 },
      { x: 420, y: 350 },
      { x: 480, y: 380 },
      { x: 540, y: 350 },
      { x: 580, y: 300 },
      { x: 540, y: 250 },
      { x: 480, y: 220 },
    ]
  }
};

// DOM 초기화 및 이벤트 리스너 설정 함수
function initializeGame() {
  gameOverlay = document.getElementById('game-overlay');
  overlayTitle = document.getElementById('overlay-title');
  overlayMessage = document.getElementById('overlay-message');
  startGameBtn = document.getElementById('start-game-btn');

  successOverlay = document.getElementById('success-overlay');
  successTitle = document.getElementById('success-title');
  successTime = document.getElementById('success-time');

  if (!gameOverlay || !overlayTitle || !overlayMessage || !startGameBtn) {
    console.error('게임 오버레이 요소들을 찾을 수 없습니다.');
    return;
  }

  if (!successOverlay || !successTitle || !successTime) {
    console.error('성공 오버레이 요소들을 찾을 수 없습니다.');
    return;
  }

  startGameBtn.addEventListener('click', () => {
    console.log('시작 버튼 클릭됨');
    if (startGameBtn.classList.contains('restart')) {
      restartFromFailure();
    } else {
      startGame();
    }
  });

  initializeControlButtons();
  initializeChallengeButtons();

  console.log('게임 초기화 완료');
}

function initializeControlButtons() {
  const resetBtn = document.getElementById('reset-btn-mobile');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (game && gameStarted && !gameFailed) {
        game.reset(true);
        resetAllTimeRecords();
        startChallenge();
      }
    });
  }

  const arrowButtons = {
    forward: document.getElementById('forward-btn'),
    backward: document.getElementById('backward-btn'),
    left: document.getElementById('left-btn'),
    right: document.getElementById('right-btn'),
    brake: document.getElementById('brake-btn')
  };

  Object.keys(arrowButtons).forEach(direction => {
    const button = arrowButtons[direction];
    if (!button) return;

    const startEvent = (e) => {
      e.preventDefault();
      if (controls) {
        controls.state.set(direction, true);
      }
    };

    const endEvent = (e) => {
      e.preventDefault();
      if (controls) {
        controls.state.set(direction, false);
      }
    };

    button.addEventListener('touchstart', startEvent);
    button.addEventListener('touchend', endEvent);
    button.addEventListener('touchcancel', endEvent);
    button.addEventListener('mousedown', startEvent);
    button.addEventListener('mouseup', endEvent);
    button.addEventListener('mouseleave', endEvent);
  });
}

const controls = new Controls();
let game = null;
let running = false;
let gameStarted = false;
let gameFailed = false;
let runtimeError = null;
let lastTime = performance.now();

let gameOverlay, overlayTitle, overlayMessage, startGameBtn;

// 주행 도전 시스템 변수들
let currentChallenge = 'outer'; // 기본값: 외곽 트랙
let consecutiveMode = false; // 연속 주행 모드 (전체 버튼)
let challengeStartTime = null;
let lastCompletionTime = null; // 마지막 완료 시간 추적
let nextCourseStartTime = null; // 다음 코스 측정 시작 시간
let completedCourses = new Set();
let timeRecords = {
  outer: null,
  outer2: null,
  s: null,
  s2: null,
  all: null
};
let successOverlay, successTitle, successTime;

function startGame() {
  game = new Game();
  runtimeError = null;
  gameStarted = true;
  gameFailed = false;
  running = true;

  gameOverlay.classList.add('hidden');

  startChallenge();

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function restartFromFailure() {
  if (!game) return;

  game.reset(false);
  runtimeError = null;
  gameStarted = true;
  gameFailed = false;
  running = true;

  gameOverlay.classList.add('hidden');

  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function showGameOver(title, message, isRestart = false) {
  running = false;
  gameStarted = false;

  overlayTitle.textContent = title;
  overlayMessage.textContent = message;
  startGameBtn.textContent = isRestart ? '다시 시작' : '게임 시작';
  startGameBtn.className = isRestart ? 'start-btn restart' : 'start-btn';
  gameOverlay.classList.remove('hidden');
}

function failGame(reason) {
  if (!gameFailed) {
    gameFailed = true;
    const message = reason || game.grade || '차선을 이탈했습니다';
    console.log(`❌ 게임 실패: ${message}`);

    // 연속 모드(전체 버튼)인 경우 완전 리셋
    if (consecutiveMode && currentChallenge === 'all') {
      console.log('연속 주행 챌린지 실패 - 처음부터 다시 시작');
      resetConsecutiveChallenge();
    }

    setTimeout(() => {
      showGameOver('주행 실패!', `${message}. 다시 시도해보세요.`, true);
    }, 500);  // 1000 → 500ms로 단축
  }
}

function loop(now) {
  if (!running) return;
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  try {
    game.update(dt);
    game.render();
  } catch (err) {
    runtimeError = err;
    running = false;
    console.error('시뮬레이터 오류:', err);
    drawFatalError(err);
    return;
  }
  requestAnimationFrame(loop);
}

function Controls() {
  this.state = new Map();
  this.touchState = {
    touching: false,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0
  };

  const keyMap = {
    ArrowUp: 'forward',
    ArrowDown: 'backward',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'forward',
    KeyS: 'backward',
    KeyA: 'left',
    KeyD: 'right',
    Space: 'brake',
    KeyR: 'reset',
  };

  window.addEventListener('keydown', (e) => {
    const action = keyMap[e.code];
    if (action) {
      if (action === 'reset') {
        if (game) {
          game.reset(true);
          resetAllTimeRecords();
          startChallenge();
        }
        return;
      }
      this.state.set(action, true);
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    const action = keyMap[e.code];
    if (action) {
      this.state.set(action, false);
      e.preventDefault();
    }
  });

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    const touchX = touch.clientX - rect.left;
    const touchY = touch.clientY - rect.top;

    if (this.checkCarBrakeButtonClick(touchX, touchY)) {
      this.state.set('brake', true);
      setTimeout(() => {
        this.state.set('brake', false);
      }, 200);
      return;
    }

    this.touchState.touching = true;
    this.touchState.startX = touchX;
    this.touchState.startY = touchY;
    this.touchState.currentX = this.touchState.startX;
    this.touchState.currentY = this.touchState.startY;
  });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!this.touchState.touching) return;

    const touch = e.touches[0];
    const rect = canvas.getBoundingClientRect();
    this.touchState.currentX = touch.clientX - rect.left;
    this.touchState.currentY = touch.clientY - rect.top;

    this.updateTouchControls();
  });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    this.touchState.touching = false;
    this.state.set('forward', false);
    this.state.set('backward', false);
    this.state.set('left', false);
    this.state.set('right', false);
  });

  canvas.addEventListener('click', (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    if (this.checkCarBrakeButtonClick(clickX, clickY)) {
      this.state.set('brake', true);
      setTimeout(() => {
        this.state.set('brake', false);
      }, 200);
    }
  });

  this.updateTouchControls = function() {
    if (!this.touchState.touching) return;

    const deltaX = this.touchState.currentX - this.touchState.startX;
    const deltaY = this.touchState.currentY - this.touchState.startY;

    if (deltaY < -30) {
      this.state.set('forward', true);
      this.state.set('backward', false);
    } else if (deltaY > 30) {
      this.state.set('backward', true);
      this.state.set('forward', false);
    } else {
      this.state.set('forward', false);
      this.state.set('backward', false);
    }

    if (deltaX < -20) {
      this.state.set('left', true);
      this.state.set('right', false);
    } else if (deltaX > 20) {
      this.state.set('right', true);
      this.state.set('left', false);
    } else {
      this.state.set('left', false);
      this.state.set('right', false);
    }
  };

  this.checkCarBrakeButtonClick = function(clickX, clickY) {
    if (!game || !game.car) return false;

    const car = game.car;
    const carScreenX = car.position.x;
    const carScreenY = car.position.y;

    const distance = Math.sqrt(
      Math.pow(clickX - carScreenX, 2) +
      Math.pow(clickY - carScreenY, 2)
    );

    return distance <= 18;
  };
}

function Game() {
  this.elapsed = 0;
  this.currentCourse = currentChallenge;
  this.courseCompleted = false;
  this.lapProgress = 0; // 외곽 트랙 진행도 (0~1)

  // 코스별 완주 여부 (영구 기록 - 한 번 성공하면 계속 유지)
  this.courseAchieved = {
    outer: false,  // 주행1
    outer2: false, // 주행2
    s: false,      // S라인1
    s2: false      // S라인2
  };

  this.isClockwise = (currentChallenge === 'outer2'); // 시계방향 여부 (트랙2)

  // 신호등 시스템
  this.trafficLights = this.initTrafficLights();

  // 정지선 통과 감지용 (트랙에 따라 접근 방향이 달라짐)
  if (this.isClockwise) {
    // 트랙2: 시계방향 회전
    this.stopLines = [
      { id: 1, x: 640, y: 445, passed: false, lightId: 1, wasOnStopLine: false, approachFrom: 'right' },  // 우하단 - 오른쪽에서 접근
      { id: 2, x: 640, y: 90, passed: false, lightId: 2, wasOnStopLine: false, approachFrom: 'left' },    // 우상단 - 왼쪽에서 접근
      { id: 3, x: 320, y: 90, passed: false, lightId: 3, wasOnStopLine: false, approachFrom: 'left' },    // 좌상단 - 왼쪽에서 접근
      { id: 4, x: 320, y: 445, passed: false, lightId: 4, wasOnStopLine: false, approachFrom: 'right' }   // 좌하단 - 오른쪽에서 접근
    ];
  } else {
    // 트랙1: 반시계방향 회전
    this.stopLines = [
      { id: 1, x: 640, y: 445, passed: false, lightId: 1, wasOnStopLine: false, approachFrom: 'left' },   // 우하단 - 왼쪽에서 접근
      { id: 2, x: 640, y: 90, passed: false, lightId: 2, wasOnStopLine: false, approachFrom: 'right' },   // 우상단 - 오른쪽에서 접근
      { id: 3, x: 320, y: 90, passed: false, lightId: 3, wasOnStopLine: false, approachFrom: 'right' },   // 좌상단 - 오른쪽에서 접근
      { id: 4, x: 320, y: 445, passed: false, lightId: 4, wasOnStopLine: false, approachFrom: 'left' }    // 좌하단 - 왼쪽에서 접근
    ];
  }

  // 현재 활성화된 신호등 인덱스
  // 반시계방향: 0=1번, 1=2번, 2=3번, 3=4번, 4=완료
  // 시계방향: 3=4번, 2=3번, 1=2번, 0=1번, -1=완료
  if (this.isClockwise) {
    this.currentActiveLightIndex = 3; // 4번부터 시작 (역순)
  } else {
    this.currentActiveLightIndex = 0; // 1번부터 시작
  }

  this.reset(true);
}

// 신호등 초기화 (랜덤으로 2개 선택하되 처음엔 모두 초록색)
Game.prototype.initTrafficLights = function() {
  const lights = [
    { id: 1, x: 640, y: 366, red: false, willBeRed: false, justTurnedGreen: false },  // 우하단 (390 → 378 → 366, -24px)
    { id: 2, x: 640, y: 150, red: false, willBeRed: false, justTurnedGreen: false },  // 우상단
    { id: 3, x: 320, y: 150, red: false, willBeRed: false, justTurnedGreen: false },  // 좌상단
    { id: 4, x: 320, y: 366, red: false, willBeRed: false, justTurnedGreen: false }   // 좌하단 (390 → 378 → 366, -24px)
  ];

  // 랜덤으로 2개 선택하여 빨간색으로 바뀔 예정으로 표시
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  lights[indices[0]].willBeRed = true;
  lights[indices[1]].willBeRed = true;

  return lights;
};

Game.prototype.reset = function reset(fullReset = false) {
  // 도전 모드에 따라 시작 위치 설정
  if (currentChallenge === 's') {
    // S라인: 오른쪽 아래 출발 주차 박스 안 (중앙: 800, 500)
    // 차량을 -90도 회전하여 위쪽을 향하도록 함
    this.car = new Car({ x: 800, y: 500, heading: -Math.PI / 2 });
    this.sTrackReachedGoal = false;  // 도착 여부
  } else if (currentChallenge === 's2') {
    // S라인2: 왼쪽 위 도착 주차 박스 안 (중앙: 80, 65)에서 출발
    // 차량을 90도 회전하여 아래쪽을 향하도록 함
    this.car = new Car({ x: 80, y: 65, heading: Math.PI / 2 });
    this.sTrackReachedGoal = false;  // 도착 여부
  } else if (currentChallenge === 'outer2') {
    // 트랙2: 시계방향 회전 - 하단 중앙에서 180도(왼쪽) 방향으로 출발
    this.car = new Car({ x: 480, y: 450, heading: Math.PI });
  } else {
    // 트랙1: 반시계방향 회전 - 하단 중앙에서 0도(오른쪽) 방향으로 출발
    this.car = new Car({ x: 480, y: 450, heading: 0 });
  }
  this.elapsed = 0;
  this.grade = '진행중';
  this.courseCompleted = false;
  this.lapProgress = 0;
  this.startAngle = null; // 출발 각도 기록용 (사용 안 함)
  this.trackStartPos = null;  // 트랙 시작 위치
  this.trackDistance = 0;     // 트랙 이동 거리
  this.lastPos = null;        // 마지막 위치

  // 정지선 통과 상태 초기화
  if (this.stopLines) {
    this.stopLines.forEach(line => {
      line.passed = false;
      line.wasOnStopLine = false;
      line.enteredWhileRed = false;
    });
  }

  // 현재 활성 신호등 인덱스 초기화
  if (this.isClockwise) {
    this.currentActiveLightIndex = 3; // 시계방향: 4번부터 시작
  } else {
    this.currentActiveLightIndex = 0; // 반시계방향: 1번부터 시작
  }

  // 신호등 재초기화 (랜덤으로 2개 선택)
  if (fullReset || !this.trafficLights) {
    // 완전 초기화 또는 첫 실행
    this.trafficLights = this.initTrafficLights();
  } else {
    // 재시작 시: 모든 신호등 초록색으로 리셋
    this.trafficLights.forEach(light => {
      light.red = false;
      light.willBeRed = false;
      light.justTurnedGreen = false;
    });
  }

  // 항상 랜덤으로 2개 선택하여 willBeRed 설정
  const indices = [0, 1, 2, 3];
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  this.trafficLights[indices[0]].willBeRed = true;
  this.trafficLights[indices[1]].willBeRed = true;
  console.log(`🎲 랜덤 신호등 선택: ${indices[0] + 1}번, ${indices[1] + 1}번이 빨간불로 변경됩니다.`);

  // 타이머 제거됨
};

Game.prototype.update = function update(dt) {
  // 도전이 진행 중일 때만 시간 증가 (완주 후에는 정지)
  if (challengeStartTime !== null) {
    this.elapsed += dt;
  }

  const car = this.car;
  const snapshot = controls.state;
  const steerInput = (snapshot.get('left') ? -1 : 0) + (snapshot.get('right') ? 1 : 0);
  const accelInput = (snapshot.get('forward') ? 1 : 0) + (snapshot.get('backward') ? -1 : 0);

  const brake = snapshot.get('brake');
  car.update(dt, accelInput, steerInput, brake);
  this.checkBoundaries(car);
  this.evaluate();
};

Game.prototype.checkBoundaries = function checkBoundaries(car) {
  // 차선 이탈 감지
  const carPos = car.position;

  // 전체 모드에서는 현재 진행 중인 코스만 체크
  let checkOuterTrack = false;
  let checkSTrack = false;

  if (currentChallenge === 'outer' || currentChallenge === 'outer2') {
    checkOuterTrack = true;
  } else if (currentChallenge === 's' || currentChallenge === 's2') {
    checkSTrack = true;
  } else if (currentChallenge === 'all') {
    // 전체 모드: 현재 진행 중인 코스만 체크
    if (!this.courseAchieved.outer || !this.courseAchieved.outer2) {
      checkOuterTrack = true;
    } else {
      checkSTrack = true;
    }
  }

  if (checkOuterTrack) {
    // 외곽 둥근 사각형 트랙 차선 체크
    const dx = carPos.x - TRACK.outer.centerX;
    const dy = carPos.y - TRACK.outer.centerY;

    // 실제 도로 폭 (트랙 lineWidth와 일치)
    const roadWidth = TRACK.outer.lineWidth;  // 100 (트랙 렌더링과 정확히 일치)

    // 둥근 사각형의 직선 구간과 코너 구간 분리
    const halfWidth = TRACK.outer.width / 2;
    const halfHeight = TRACK.outer.height / 2;
    const radius = TRACK.outer.radius;  // 120

    const absX = Math.abs(dx);
    const absY = Math.abs(dy);

    // 코너 영역인지 확인 (직선이 끝나고 곡선이 시작되는 부분)
    const inCornerX = absX > halfWidth - radius;
    const inCornerY = absY > halfHeight - radius;
    const inCorner = inCornerX && inCornerY;

    let isOutside = false;

    if (inCorner) {
      // 코너 영역: 원형 경계 체크
      // 코너 중심점 계산
      const cornerCenterX = (dx > 0 ? 1 : -1) * (halfWidth - radius);
      const cornerCenterY = (dy > 0 ? 1 : -1) * (halfHeight - radius);

      // 코너 중심에서 차량까지 거리
      const distToCornerCenter = Math.sqrt(
        Math.pow(dx - cornerCenterX, 2) +
        Math.pow(dy - cornerCenterY, 2)
      );

      // 외곽 경계: 코너 반경 + 도로 폭/2
      const outerRadius = radius + roadWidth / 2;
      // 내곽 경계: 코너 반경 - 도로 폭/2
      const innerRadius = radius - roadWidth / 2;

      // 코너에서 벗어났는지 체크
      isOutside = distToCornerCenter > outerRadius || distToCornerCenter < innerRadius;

      if (isOutside) {
        console.log(`🚨 차선 이탈 (코너)! 위치=(${carPos.x.toFixed(0)}, ${carPos.y.toFixed(0)}), 코너중심거리=${distToCornerCenter.toFixed(0)}, 외곽반경=${outerRadius.toFixed(0)}, 내곽반경=${innerRadius.toFixed(0)}`);
      }
    } else {
      // 직선 영역: 직사각형 경계 체크
      const outerHalfWidth = halfWidth + roadWidth / 2;
      const outerHalfHeight = halfHeight + roadWidth / 2;
      const innerHalfWidth = halfWidth - roadWidth / 2;
      const innerHalfHeight = halfHeight - roadWidth / 2;

      const outsideOuter = absX > outerHalfWidth || absY > outerHalfHeight;
      const insideInner = absX < innerHalfWidth && absY < innerHalfHeight;

      isOutside = outsideOuter || insideInner;

      if (isOutside) {
        console.log(`🚨 차선 이탈 (직선)! 위치=(${carPos.x.toFixed(0)}, ${carPos.y.toFixed(0)}), dx=${absX.toFixed(0)}, dy=${absY.toFixed(0)}, 외곽=${outsideOuter}, 내곽=${insideInner}`);
      }
    }

    // 차선 이탈 시 실패
    if (isOutside) {
      this.grade = '차선 이탈';
      failGame('차선 이탈');
      return;
    }
  }

  if (checkSTrack) {
    // S자 트랙 차선 체크
    const laneWidth = 100;
    const maxDistance = laneWidth / 2;  // 중심선에서 최대 50px까지 허용

    // S자 트랙 중심선까지의 최단 거리 계산
    const distToSTrack = this.getDistanceToSTrack(carPos.x, carPos.y);

    // 차선 이탈 시 실패
    if (distToSTrack > maxDistance) {
      this.grade = '차선 이탈';
      failGame();
    }
  }
};

// S자 트랙 중심선까지의 최단 거리 계산
Game.prototype.getDistanceToSTrack = function getDistanceToSTrack(x, y) {
  // S자 트랙의 주요 포인트들
  const points = [];

  // 시작 직선 추가 (도착 구역 포함)
  for (let py = 50; py <= 270; py += 10) {
    points.push({ x: 80, y: py });
  }

  // 베지어 곡선을 샘플링해서 포인트 추가
  for (let t = 0; t <= 1; t += 0.05) {
    // 첫 번째 베지어 곡선: (80, 270) -> (150, 340), (250, 360) -> (360, 320)
    const t1 = 1 - t;
    const x1 = t1*t1*t1*80 + 3*t1*t1*t*150 + 3*t1*t*t*250 + t*t*t*360;
    const y1 = t1*t1*t1*270 + 3*t1*t1*t*340 + 3*t1*t*t*360 + t*t*t*320;
    points.push({ x: x1, y: y1 });
  }

  for (let t = 0; t <= 1; t += 0.05) {
    // 두 번째 베지어 곡선: (360, 320) -> (470, 280), (550, 240) -> (630, 220)
    const t1 = 1 - t;
    const x2 = t1*t1*t1*360 + 3*t1*t1*t*470 + 3*t1*t*t*550 + t*t*t*630;
    const y2 = t1*t1*t1*320 + 3*t1*t1*t*280 + 3*t1*t*t*240 + t*t*t*220;
    points.push({ x: x2, y: y2 });
  }

  for (let t = 0; t <= 1; t += 0.05) {
    // 세 번째 베지어 곡선: (630, 220) -> (710, 200), (760, 220) -> (800, 270)
    const t1 = 1 - t;
    const x3 = t1*t1*t1*630 + 3*t1*t1*t*710 + 3*t1*t*t*760 + t*t*t*800;
    const y3 = t1*t1*t1*220 + 3*t1*t1*t*200 + 3*t1*t*t*220 + t*t*t*270;
    points.push({ x: x3, y: y3 });
  }

  // 끝 직선 추가 (출발 구역 포함)
  for (let py = 270; py <= 520; py += 10) {
    points.push({ x: 800, y: py });
  }

  // 모든 포인트와의 거리 계산 후 최소값 반환
  let minDist = Infinity;
  for (const p of points) {
    const dist = Math.sqrt((x - p.x) ** 2 + (y - p.y) ** 2);
    if (dist < minDist) {
      minDist = dist;
    }
  }

  return minDist;
};

Game.prototype.evaluate = function evaluate() {
  const car = this.car;

  // 전체 모드에서는 현재 진행 중인 코스만 평가
  let evaluateOuterTrack = false;
  let evaluateSTrack = false;

  if (currentChallenge === 'outer' || currentChallenge === 'outer2') {
    evaluateOuterTrack = true;
  } else if (currentChallenge === 's' || currentChallenge === 's2') {
    evaluateSTrack = true;
  } else if (currentChallenge === 'all') {
    // 전체 모드: 현재 진행 중인 코스만 평가
    if (!this.courseAchieved.outer || !this.courseAchieved.outer2) {
      evaluateOuterTrack = true;
    } else {
      evaluateSTrack = true;
    }
  }

  if (evaluateOuterTrack) {
    // 도착 주차 구역 체크 (90도 회전 - 가로 방향)
    const finishX = TRACK.outer.centerX;
    const finishY = 450;  // 차량 시작 위치와 동일 (차량 중앙 기준)
    const finishWidth = 110;  // 가로 길이
    const finishHeight = 70;  // 세로 길이

    // 차량 크기
    const carLength = car.length;  // 80
    const carWidth = car.width;    // 40

    // 시작 위치 기록 (거리 체크용)
    if (!this.trackStartPos) {
      this.trackStartPos = { x: car.position.x, y: car.position.y };
      this.trackDistance = 0;
      this.lastPos = { x: car.position.x, y: car.position.y };
    }

    // 이동 거리 누적
    const dx = car.position.x - this.lastPos.x;
    const dy = car.position.y - this.lastPos.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    this.trackDistance += distance;
    this.lastPos = { x: car.position.x, y: car.position.y };

    // 트랙 둘레 계산
    const trackPerimeter = 2 * (TRACK.outer.width + TRACK.outer.height) * 0.9;

    // 주차 구역 안에 들어왔는지 체크 (박스가 가로 방향이므로 차량 길이와 너비 매칭)
    const inFinishX = Math.abs(car.position.x - finishX) < (finishWidth / 2 - carLength / 2);
    const inFinishY = Math.abs(car.position.y - finishY) < (finishHeight / 2 - carWidth / 2);
    const inFinish = inFinishX && inFinishY;

    // 완주 조건: 주차 구역 안 + 정지 + 충분한 거리 이동
    const readyToComplete = inFinish && Math.abs(car.speed) < 0.5 && this.trackDistance > trackPerimeter * 0.7;

    if (readyToComplete && !this.courseCompleted) {
      this.courseCompleted = true;

      // 연속 모드가 아닐 때만 성공 메시지 표시
      if (!consecutiveMode) {
        this.grade = '완주 성공';
      }

      checkCourseComplete();
    }

    // 신호등 색상 업데이트 (차량 크기의 1.5배 거리 앞에서 빨간색으로 변경)
    const carSize = 80;  // 차량 길이
    const triggerDistance = carSize * 1.5;  // 120px

    this.trafficLights.forEach(light => {
      const distance = Math.sqrt(
        (car.position.x - light.x) ** 2 +
        (car.position.y - light.y) ** 2
      );

      // willBeRed가 true인 신호등: 가까워지면 빨간색으로 변경
      // 단, 방금 초록불로 바뀐 신호등(justTurnedGreen)은 빨간색으로 바꾸지 않음
      if (distance < triggerDistance && light.willBeRed && !light.red && !light.justTurnedGreen) {
        light.red = true;
        console.log(`🔴 신호등 ${light.id}번: 차량 접근 → 빨간불로 변경 (거리: ${distance.toFixed(0)}px)`);
      }
    });

    // 가장 가까운 신호등 찾기
    let closestLight = null;
    let minDistance = Infinity;
    let lightDistances = [];

    this.trafficLights.forEach(light => {
      const distance = Math.sqrt(
        Math.pow(car.position.x - light.x, 2) +
        Math.pow(car.position.y - light.y, 2)
      );
      lightDistances.push({ id: light.id, distance: distance.toFixed(1), red: light.red });
      if (distance < minDistance) {
        minDistance = distance;
        closestLight = light;
      }
    });

    // 디버그: 빨간불 신호등이 있을 때 모든 거리 출력
    const hasRedLight = this.trafficLights.some(l => l.red);
    if (hasRedLight && Math.random() < 0.01) {  // 1% 확률로 출력 (스팸 방지)
      console.log(`🚦 가장 가까운 신호등: ${closestLight.id}번 (${minDistance.toFixed(1)}px)`, lightDistances);
    }

    // ========== 단순화된 신호등 시스템 ==========
    // 현재 활성화된 신호등만 처리
    // 반시계방향: 1번 → 2번 → 3번 → 4번 (0→1→2→3→4)
    // 시계방향: 4번 → 3번 → 2번 → 1번 (3→2→1→0→-1)
    if (this.isClockwise) {
      if (this.currentActiveLightIndex < 0) return; // 모든 신호등 처리 완료
    } else {
      if (this.currentActiveLightIndex >= 4) return; // 모든 신호등 처리 완료
    }

    const currentStopLineIndex = this.currentActiveLightIndex;
    const stopLine = this.stopLines[currentStopLineIndex];
    const light = this.trafficLights[currentStopLineIndex];

    // 차량 앞쪽 끝 위치 계산 (차량 길이의 절반 = 40px)
    const carFrontX = car.position.x + Math.cos(car.heading) * 40;
    const carFrontY = car.position.y + Math.sin(car.heading) * 40;

    // 거리 계산 (X축만 사용, 접근 방향에 따라)
    let distanceToStopLine;
    if (stopLine.approachFrom === 'left') {
      // 왼쪽에서 접근 (1번, 4번): 정지선까지의 거리 = stopLine.x - carFrontX
      distanceToStopLine = stopLine.x - carFrontX;
    } else {
      // 오른쪽에서 접근 (2번, 3번): 정지선까지의 거리 = carFrontX - stopLine.x
      distanceToStopLine = carFrontX - stopLine.x;
    }

    // 정지선 감지 구역 (0~100px)
    const inStopZone = distanceToStopLine > 0 && distanceToStopLine < 100;
    // 정지선 통과 (거리가 음수 = 정지선을 넘음)
    const crossed = distanceToStopLine < -10;

    // 디버그 로그 (정지 시 항상 출력)
    if (Math.abs(car.speed) < 0.1) {
      console.log(`📍 ${stopLine.id}번 신호등: 거리=${distanceToStopLine.toFixed(1)}px, 신호=${light.red ? '빨강' : '초록'}, 속도=${car.speed.toFixed(2)}, 접근=${stopLine.approachFrom}, 차량위치=(${carFrontX.toFixed(1)}, ${carFrontY.toFixed(1)}), 정지선=(${stopLine.x}, ${stopLine.y}), heading=${(car.heading * 180 / Math.PI).toFixed(1)}°, inStopZone=${inStopZone}`);
    } else if (Math.random() < 0.02) {
      console.log(`📍 ${stopLine.id}번 신호등: 거리=${distanceToStopLine.toFixed(1)}px, 신호=${light.red ? '빨강' : '초록'}, 속도=${car.speed.toFixed(2)}`);
    }

    // 빨간불 + 정지선 침범 (거리 0 이하)
    if (distanceToStopLine <= 0 && light.red && !stopLine.passed) {
      console.log(`🚨 ${stopLine.id}번 신호등: 빨간불 침범! 거리=${distanceToStopLine.toFixed(1)}px`);
      this.grade = '신호위반';
      failGame('신호위반 (빨간불 침범)');
      return;
    }

    // 완전 정지 시 초록불 전환
    if (inStopZone && Math.abs(car.speed) === 0 && light.red) {
      console.log(`🟢 ${stopLine.id}번 신호등: 정지 감지 → 초록불 전환`);
      light.red = false;
      light.justTurnedGreen = true;
    }

    // 정지선 통과 감지
    if (crossed && !stopLine.passed) {
      stopLine.passed = true;

      if (light.red) {
        console.log(`🚨 ${stopLine.id}번 신호등: 빨간불 통과! 거리=${distanceToStopLine.toFixed(1)}px`);
        this.grade = '신호위반';
        failGame('신호위반 (빨간불 통과)');
        return;
      }

      console.log(`✅ ${stopLine.id}번 신호등: 초록불 통과 성공! 다음 신호등 활성화`);

      // 다음 신호등으로 이동
      if (this.isClockwise) {
        this.currentActiveLightIndex--; // 시계방향: 감소 (4→3→2→1)
      } else {
        this.currentActiveLightIndex++; // 반시계방향: 증가 (1→2→3→4)
      }

      // 현재 신호등 비활성화
      light.willBeRed = false;
      light.justTurnedGreen = false;
    }
  }

  if (evaluateSTrack) {
    // S자 트랙 주차 구역 체크
    let parkingX, parkingY, targetHeading;

    // 전체 모드에서 현재 어느 S라인인지 확인
    let isS2 = false;
    if (currentChallenge === 's2') {
      isS2 = true;
    } else if (currentChallenge === 'all') {
      // 전체 모드: S라인1 완료했으면 S라인2
      isS2 = this.courseAchieved.s;
    }

    if (isS2) {
      // S라인2: 출발 박스(오른쪽 아래)가 목적지
      parkingX = 800;
      parkingY = 500;
      targetHeading = Math.PI / 2;  // 90도 (아래쪽)
    } else {
      // S라인1: 도착 박스(왼쪽 위)가 목적지
      parkingX = 80;
      parkingY = 65;
      targetHeading = -Math.PI / 2;  // -90도 (위쪽)
    }

    const parkingWidth = 70;  // 차량 폭(40px)보다 충분히 크게 (기존 55 → 70)
    const parkingHeight = 110;  // 차량 길이(80px)보다 충분히 크게 (기존 90 → 110)

    // 차량의 크기 (길이 80px, 폭 40px)
    const carLength = car.length;  // 80
    const carWidth = car.width;    // 40

    // 차량이 완전히 주차 구역 안에 들어왔는지 체크
    const inParkingX = Math.abs(car.position.x - parkingX) < (parkingWidth / 2 - carWidth / 2);
    const inParkingY = Math.abs(car.position.y - parkingY) < (parkingHeight / 2 - carLength / 2);
    const inParking = inParkingX && inParkingY;

    // 차량 각도가 목표 각도에 가까운지 체크 (±15도 허용)
    let headingDiff = Math.abs(normalizeAngle(car.heading - targetHeading));
    const correctAngle = headingDiff < degToRad(15);

    // 완주 조건: 주차 구역 안 + 정지 + 올바른 각도
    const readyToComplete = inParking && Math.abs(car.speed) < 0.5 && correctAngle;

    // 완주 조건을 만족할 때만 초록색 표시 (동기화)
    if (readyToComplete && !this.sTrackReachedGoal) {
      this.sTrackReachedGoal = true;
    }

    // 완주 처리
    if (readyToComplete && !this.courseCompleted) {
      this.courseCompleted = true;

      // 연속 모드가 아닐 때만 성공 메시지 표시
      if (!consecutiveMode) {
        this.grade = '완주 성공';
      }

      // 도전 완료 체크 (즉시 시간 기록)
      checkCourseComplete();
    }
  }
};

Game.prototype.render = function render() {
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  this.drawBackground();
  this.drawTrack();
  this.car.draw(ctx);
  ctx.restore();
  drawOverlays(this.grade, this.elapsed, this.car.speed, this.car.steerAngle);
};

Game.prototype.drawBackground = function drawBackground() {
  const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  grad.addColorStop(0, '#2c323a');
  grad.addColorStop(1, '#191f28');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#171d24';
  ctx.fillRect(0, 0, canvas.width, 45);
  ctx.fillRect(0, canvas.height - 80, canvas.width, 80);
};

Game.prototype.drawTrack = function drawTrack() {
  ctx.save();

  const outer = TRACK.outer;
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 4;

  // 도전 모드에 따라 다른 트랙 표시
  let showOuterTrack = false;
  let showSTrack = false;

  if (currentChallenge === 'outer' || currentChallenge === 'outer2') {
    // 개별 주행 모드
    showOuterTrack = true;
  } else if (currentChallenge === 's' || currentChallenge === 's2') {
    // 개별 S라인 모드
    showSTrack = true;
  } else if (currentChallenge === 'all') {
    // 전체 모드: 현재 진행 중인 코스만 표시
    if (!this.courseAchieved.outer || !this.courseAchieved.outer2) {
      // 주행1 또는 주행2 진행 중
      showOuterTrack = true;
    } else {
      // S라인1 또는 S라인2 진행 중
      showSTrack = true;
    }
  }

  if (showOuterTrack) {
    this.drawOvalTrack();
  }

  if (showSTrack) {
    this.drawSTrack();
  }

  ctx.restore();
};

// 둥근 사각형 트랙 그리기
Game.prototype.drawOvalTrack = function drawOvalTrack() {
  const outer = TRACK.outer;
  const laneWidth = outer.lineWidth;  // 100

  // 둥근 사각형 경로를 그리는 함수
  function drawRoundedRect(width, height, radius) {
    const x = outer.centerX - width / 2;
    const y = outer.centerY - height / 2;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.arcTo(x + width, y, x + width, y + radius, radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
    ctx.lineTo(x + radius, y + height);
    ctx.arcTo(x, y + height, x, y + height - radius, radius);
    ctx.lineTo(x, y + radius);
    ctx.arcTo(x, y, x + radius, y, radius);
    ctx.closePath();
  }

  // 1. 가장 바깥쪽 노란색 라인 (가장 두꺼운 선)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = laneWidth + 10;  // 110
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 2. 빨간색 도로 면 (중간 두께)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth;  // 100
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 3. 흰색 라인 (중간보다 조금 얇은 선)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = laneWidth - 16;  // 84
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 4. 빨간색 도로 안쪽 (가장 얇은 선)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth - 22;  // 78
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();

  // 5. 중앙 흰색 점선
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);  // 점선 패턴
  drawRoundedRect(outer.width, outer.height, outer.radius);
  ctx.stroke();
  ctx.setLineDash([]);  // 점선 해제

  // 6. 도착 주차 구역 (하단 중앙, 90도 회전 - 가로 방향)
  const finishX = outer.centerX;
  const finishY = 450;  // 차량 시작 위치와 동일 (차량 중앙 기준)
  const finishWidth = 110;  // 가로 길이 (기존 height)
  const finishHeight = 70;  // 세로 길이 (기존 width)

  // 완주 조건 만족 시 초록색, 아니면 검정색
  const finishColor = this.courseCompleted ? '#4ade80' : '#000000';

  // 주차 구역 사각형 (점선)
  ctx.strokeStyle = finishColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(
    finishX - finishWidth / 2,
    finishY - finishHeight / 2,
    finishWidth,
    finishHeight
  );

  // 주차 구역 양 끝 실선 (상단/하단)
  ctx.setLineDash([]);
  ctx.lineWidth = 3;

  // 상단 실선
  ctx.beginPath();
  ctx.moveTo(finishX - finishWidth / 2, finishY - finishHeight / 2);
  ctx.lineTo(finishX + finishWidth / 2, finishY - finishHeight / 2);
  ctx.stroke();

  // 하단 실선
  ctx.beginPath();
  ctx.moveTo(finishX - finishWidth / 2, finishY + finishHeight / 2);
  ctx.lineTo(finishX + finishWidth / 2, finishY + finishHeight / 2);
  ctx.stroke();

  // 도착 텍스트 (주차 박스 안)
  ctx.fillStyle = finishColor;
  ctx.font = 'bold 20px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('출발/도착', finishX, finishY);

  // 7. 신호등 4개 (1번: 우하단, 2번: 우상단, 3번: 좌상단, 4번: 좌하단)
  const trafficLightRadius = 12;
  const trafficLightBorder = 3;

  // 신호등 그리기 함수
  const drawTrafficLight = (x, y, label, isRed) => {
    // 신호등 기둥 (회색)
    ctx.fillStyle = '#4a5568';
    ctx.fillRect(x - 3, y, 6, 30);

    // 신호등 박스 (검은색)
    ctx.fillStyle = '#2d3748';
    ctx.fillRect(x - trafficLightRadius - 2, y - trafficLightRadius - 2,
                 trafficLightRadius * 2 + 4, trafficLightRadius * 2 + 4);

    // 신호등 (빨간색 또는 초록색)
    ctx.fillStyle = isRed ? '#ef4444' : '#10b981';
    ctx.beginPath();
    ctx.arc(x, y, trafficLightRadius - trafficLightBorder, 0, Math.PI * 2);
    ctx.fill();

    // 번호 표시 (모두 옆으로 이동)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 16px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (label === '1' || label === '4') {
      // 1번, 4번: 오른쪽으로 이동, 위로 24px 올림
      ctx.fillText(label, x + 25, y + 21);  // y + 45 → y + 21 (-24px)
    } else {
      // 2번, 3번: 왼쪽으로 이동
      ctx.fillText(label, x - 25, y + 45);
    }
  };

  // 신호등을 트랙 도로 위에 배치 (동적 색상)
  this.trafficLights.forEach(light => {
    drawTrafficLight(light.x, light.y, light.id.toString(), light.red);

    // 정지선 그리기 (노란색)
    ctx.strokeStyle = '#facc15';  // 노란색
    ctx.lineWidth = 6;
    ctx.setLineDash([]);

    // 1번, 4번: 수직선 (신호등 아래, 트랙 중앙 기준) - 양쪽으로 12px 연장
    if (light.id === 1 || light.id === 4) {
      const upperLength = 37;     // 위쪽 길이 (25 + 12)
      const lowerLength = 47;     // 아래쪽 길이 (35 + 12)
      const stopX = light.x;
      const stopY = 445;  // 고정된 Y 좌표 (신호등 이동과 무관)

      ctx.beginPath();
      ctx.moveTo(stopX, stopY - upperLength);
      ctx.lineTo(stopX, stopY + lowerLength);
      ctx.stroke();
    }
    // 2번, 3번: 수직선 (신호등 위쪽 트랙 위, 흰색 중앙선 기준 대칭) - 양쪽으로 12px 연장
    else {
      const upperLength = 42;     // 위쪽 길이 (30 + 12)
      const lowerLength = 42;     // 아래쪽 길이 (30 + 12)
      const stopX = light.x;
      const stopY = light.y - 60;  // 더 위로 올림 (위아래 흰색 실선과 같은 간격)

      ctx.beginPath();
      ctx.moveTo(stopX, stopY - upperLength);
      ctx.lineTo(stopX, stopY + lowerLength);
      ctx.stroke();
    }
  });
};

// S자 트랙만 그리기
Game.prototype.drawSTrack = function drawSTrack() {
  const laneWidth = 100;

  // 중심선 경로 정의
  function drawCenterPath() {
    ctx.moveTo(80, 80);
    ctx.lineTo(80, 270);
    ctx.bezierCurveTo(150, 340, 250, 360, 360, 320);
    ctx.bezierCurveTo(470, 280, 550, 240, 630, 220);
    ctx.bezierCurveTo(710, 200, 760, 220, 800, 270);
    ctx.lineTo(800, 480);
  }

  // 1. 가장 바깥쪽 노란색 라인 (가장 두꺼운 선)
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = laneWidth + 10;  // 100 + 10 = 110
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 2. 빨간색 도로 면 (중간 두께)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth;  // 100
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 3. 흰색 라인 (중간보다 조금 얇은 선)
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = laneWidth - 16;  // 100 - 16 = 84
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 4. 빨간색 도로 안쪽 (가장 얇은 선)
  ctx.strokeStyle = '#c53030';
  ctx.lineWidth = laneWidth - 22;  // 100 - 22 = 78
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();

  // 5. 중앙 흰색 점선
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 10]);  // 점선 패턴
  ctx.lineCap = 'butt';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  drawCenterPath();
  ctx.stroke();
  ctx.setLineDash([]);  // 점선 해제

  // 6. 도착 주차 구역 (왼쪽 위)
  const goalColor = this.sTrackReachedGoal ? '#4ade80' : '#facc15';  // 도착하면 초록색, 아니면 노란색
  const parkingY = 65;  // 주차 구역 중앙 Y 좌표
  const parkingWidth = 70;  // 차량 폭(40px)보다 충분히 크게 (기존 55 → 70)
  const parkingHeight = 110;  // 차량 길이(80px)보다 충분히 크게 (기존 90 → 110)

  // 주차 구역 사각형 (점선)
  ctx.strokeStyle = goalColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(
    80 - parkingWidth / 2,
    parkingY - parkingHeight / 2,
    parkingWidth,
    parkingHeight
  );

  // 주차 구역 양 끝 실선
  ctx.setLineDash([]);
  ctx.lineWidth = 3;

  // 왼쪽 실선
  ctx.beginPath();
  ctx.moveTo(80 - parkingWidth / 2, parkingY - parkingHeight / 2);
  ctx.lineTo(80 - parkingWidth / 2, parkingY + parkingHeight / 2);
  ctx.stroke();

  // 오른쪽 실선
  ctx.beginPath();
  ctx.moveTo(80 + parkingWidth / 2, parkingY - parkingHeight / 2);
  ctx.lineTo(80 + parkingWidth / 2, parkingY + parkingHeight / 2);
  ctx.stroke();

  // S라인2인 경우 출발/도착 글자 반대
  // 전체 모드에서는 현재 진행 중인 코스에 따라 결정
  let isS2Display = false;
  if (currentChallenge === 's2') {
    isS2Display = true;
  } else if (currentChallenge === 'all' && this.courseAchieved.s) {
    // 전체 모드에서 S라인1 완료했으면 S라인2 표시
    isS2Display = true;
  }

  const topBoxText = isS2Display ? '출발' : '도착';
  const bottomBoxText = isS2Display ? '도착' : '출발';

  // 왼쪽 위 박스 텍스트 (주차 박스 중앙에 배치)
  ctx.fillStyle = goalColor;
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(topBoxText, 80, parkingY);

  // 오른쪽 아래 주차 박스
  const startX = 800;  // 중앙 X 좌표
  const startY = 500;  // 중앙 Y 좌표
  const startWidth = 70;  // 박스 너비
  const startHeight = 110;  // 박스 높이
  const startColor = '#facc15';  // 노란색

  // 주차 구역 사각형 (점선)
  ctx.strokeStyle = startColor;
  ctx.lineWidth = 3;
  ctx.setLineDash([8, 8]);
  ctx.strokeRect(
    startX - startWidth / 2,
    startY - startHeight / 2,
    startWidth,
    startHeight
  );

  // 주차 구역 양 끝 실선
  ctx.setLineDash([]);
  ctx.lineWidth = 3;

  // 위쪽 실선
  ctx.beginPath();
  ctx.moveTo(startX - startWidth / 2, startY - startHeight / 2);
  ctx.lineTo(startX + startWidth / 2, startY - startHeight / 2);
  ctx.stroke();

  // 아래쪽 실선
  ctx.beginPath();
  ctx.moveTo(startX - startWidth / 2, startY + startHeight / 2);
  ctx.lineTo(startX + startWidth / 2, startY + startHeight / 2);
  ctx.stroke();

  // 오른쪽 아래 박스 텍스트 (주차 박스 중앙에 배치)
  ctx.fillStyle = startColor;
  ctx.font = 'bold 22px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(bottomBoxText, startX, startY);

  ctx.setLineDash([]);
};

function Car({ x, y, heading }) {
  this.position = { x, y };
  this.heading = heading;
  this.velocity = 0;
  this.speed = 0;
  this.length = 80; // 116에서 축소
  this.width = 40; // 54에서 축소
  this.mass = 1200;
  this.steerAngle = 0;
}

Car.prototype.update = function update(dt, accelInput, steerInput, brake) {
  const targetSteer = steerInput * MAX_STEER;
  const steerRate = degToRad(120);
  const steerDelta = clamp(targetSteer - this.steerAngle, -steerRate * dt, steerRate * dt);
  this.steerAngle += steerDelta;

  let accelForce = accelInput * ACCEL_RATE;
  if (brake) {
    accelForce -= Math.sign(this.velocity) * BRAKE_RATE;
  }

  let drag = DRAG * this.velocity;
  let roll = ROLLING_RESIST * Math.sign(this.velocity);
  if (Math.abs(this.velocity) < 2) {
    roll = this.velocity * 40;
  }
  const force = accelForce - drag - roll;
  const acceleration = force / this.mass;
  this.velocity += acceleration * dt * PIXELS_PER_METER;
  const stopThreshold = brake ? 2 : 0.2;
  if (Math.abs(this.velocity) < stopThreshold && accelInput === 0) {
    this.velocity = 0;
  }
  this.speed = this.velocity;

  const slip = Math.tan(this.steerAngle) * (this.velocity / WHEEL_BASE) * dt;
  this.heading += slip;
  this.position.x += Math.cos(this.heading) * this.velocity * dt;
  this.position.y += Math.sin(this.heading) * this.velocity * dt;
};

Car.prototype.draw = function draw(context) {
  context.save();
  context.translate(this.position.x, this.position.y);
  context.rotate(this.heading + Math.PI / 2);
  context.fillStyle = '#e9edf5';
  context.strokeStyle = '#1c2028';
  context.lineWidth = 2;
  context.beginPath();
  drawRoundedRectPath(context, -this.width / 2, -this.length / 2, this.width, this.length, 10);
  context.fill();
  context.stroke();

  context.fillStyle = '#12151c';
  context.fillRect(-this.width / 2 + 4, -this.length / 2 + 8, this.width - 8, 14);
  context.fillRect(-this.width / 2 + 4, this.length / 2 - 20, this.width - 8, 14);

  // 자동차 앞쪽 방향 화살표 (빨간색)
  context.fillStyle = '#dc2626';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 1.5;

  // 화살표 삼각형 (차량 앞쪽 = -length/2 방향)
  context.beginPath();
  const arrowY = -this.length / 2 - 8; // 차량 앞쪽 끝에서 약간 밖
  context.moveTo(0, arrowY); // 화살표 끝점
  context.lineTo(-6, arrowY + 10); // 왼쪽 날개
  context.lineTo(6, arrowY + 10); // 오른쪽 날개
  context.closePath();
  context.fill();
  context.stroke();

  // 자동차 중앙의 정지 버튼
  context.fillStyle = '#dc2626';
  context.strokeStyle = '#ffffff';
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 10, 0, Math.PI * 2);
  context.fill();
  context.stroke();

  context.fillStyle = '#ffffff';
  context.fillRect(-4, -4, 8, 8);

  context.restore();
};

function drawOverlays(grade, elapsed, speed, steerAngle) {
  ctx.save();

  const speedKmh = Math.abs(speed / PIXELS_PER_METER * 3.6);
  const steerDegrees = (steerAngle * 180 / Math.PI);
  const direction = speed >= 0 ? '전진' : '후진';
  let steerDirection = '직진';
  if (Math.abs(steerAngle) > 0.05) {
    steerDirection = steerAngle > 0 ? '우회전' : '좌회전';
  }

  const hudText = `상태: ${grade} | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;

  ctx.font = '16px Segoe UI, sans-serif';
  const hudTextWidth = ctx.measureText(hudText).width;

  const hudWidth = hudTextWidth + 40;
  const hudHeight = 35;
  const x = (canvas.width - hudWidth) / 2;
  const y = 5;

  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x, y, hudWidth, hudHeight);

  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, hudWidth, hudHeight);

  const textX = x + 20;
  const textY = y + 23;

  ctx.fillStyle = grade === '완주 성공' ? '#4ade80' : grade === '진행중' ? '#f8fafc' : '#f87171';
  ctx.fillText(`상태: ${grade}`, textX, textY);

  ctx.fillStyle = '#f8fafc';
  const gradeWidth = ctx.measureText(`상태: ${grade}`).width;
  const remainingText = ` | 시간: ${elapsed.toFixed(1)}s | 속도: ${speedKmh.toFixed(1)} km/h | 조향: ${steerDegrees.toFixed(0)}° | ${direction} | ${steerDirection}`;
  ctx.fillText(remainingText, textX + gradeWidth, textY);

  ctx.restore();
}

function drawFatalError(err) {
  ctx.save();
  ctx.fillStyle = 'rgba(12, 16, 24, 0.92)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#f87171';
  ctx.font = '28px Segoe UI';
  ctx.fillText('렌더링 오류가 발생했습니다.', 80, 160);
  ctx.font = '18px Segoe UI';
  const message = (err && err.message) ? err.message : String(err);
  wrapText(ctx, 'Message: ' + message, 80, 210, canvas.width - 160, 24);
  ctx.fillStyle = '#94a3b8';
  ctx.fillText('자세한 내용은 개발자 도구(Console)를 확인하세요.', 80, 320);
  ctx.restore();
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrapText(context, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line + word + ' ';
    if (context.measureText(testLine).width > maxWidth && line) {
      context.fillText(line.trimEnd(), x, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) {
    context.fillText(line.trimEnd(), x, y);
  }
}

function drawRoundedRectPath(ctx, x, y, width, height, radius) {
  let r = radius;
  if (ctx.roundRect) {
    ctx.roundRect(x, y, width, height, r);
    return;
  }
  r = Math.max(0, Math.min(r, Math.min(width, height) / 2));
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
}

// 도전 시스템 함수들
function initializeChallengeButtons() {
  const challengeButtons = document.querySelectorAll('.challenge-btn');

  challengeButtons.forEach(button => {
    button.addEventListener('click', () => {
      // 모든 버튼에서 active 클래스 제거
      challengeButtons.forEach(btn => btn.classList.remove('active'));
      // 클릭된 버튼에 active 클래스 추가
      button.classList.add('active');

      // 현재 도전 모드 설정
      currentChallenge = button.dataset.course;

      // 전체(all) 모드인 경우 연속 주행 모드 활성화
      if (currentChallenge === 'all') {
        consecutiveMode = true;

        if (game) {
          // 경과 시간 초기화
          game.elapsed = 0;
          // 주행1부터 시작 (반시계방향)
          game.car = new Car({ x: 480, y: 450, heading: 0 });
          game.grade = '진행중';
          game.courseCompleted = false;
          game.isClockwise = false; // 주행1은 반시계방향

          // courseAchieved 초기화
          game.courseAchieved = {
            outer: false,
            outer2: false,
            s: false,
            s2: false
          };
        }

        console.log(`연속 주행 모드 활성화 - 주행1 → 주행2 → S라인1 → S라인2 순서로 완주`);
      } else {
        consecutiveMode = false;
        console.log(`개별 코스 모드: ${currentChallenge}`);
      }

      // 개별 도전 모드(외곽, S자)를 선택한 경우 초기화
      if (currentChallenge !== 'all') {
        if (game) {
          // 게임을 완전히 다시 생성하여 isClockwise와 stopLines를 올바르게 설정
          game = new Game();
        }

        // 전체 시간 기록도 초기화
        timeRecords.all = null;
        const allTimeElement = document.getElementById('time-record-all');
        if (allTimeElement) {
          allTimeElement.textContent = '--';
          allTimeElement.classList.remove('completed');
        }
        console.log(`${currentChallenge} 개별 도전 모드 - 차량 위치, 경과 시간 및 전체 시간 초기화`);
      }

      // 도전 시작
      startChallenge();
    });
  });
}

function resetAllTimeRecords() {
  timeRecords = {
    outer: null,
    s: null,
    all: null
  };

  const timeElements = document.querySelectorAll('.time-record');
  timeElements.forEach(element => {
    element.textContent = '--';
    element.classList.remove('completed');
  });

  console.log('모든 시간 기록이 초기화되었습니다.');
}

function resetConsecutiveChallenge() {
  // 연속 주행 챌린지 완전 리셋
  if (game) {
    // 모든 코스 완주 상태 초기화
    game.courseCompleted = false;
    game.courseAchieved = {
      outer: false,
      outer2: false,
      s: false,
      s2: false
    };
  }

  // 시간 기록도 초기화 (연속 모드에서만 all 기록)
  timeRecords = {
    outer: null,
    outer2: null,
    s: null,
    s2: null,
    all: null
  };

  console.log('연속 주행 챌린지 리셋 완료');
}

function startChallenge() {
  challengeStartTime = performance.now();
  lastCompletionTime = challengeStartTime; // 첫 번째 코스를 위한 시작 시간
  nextCourseStartTime = challengeStartTime; // 도전 시작부터 시간 측정 시작
  completedCourses.clear();

  // 연속 모드인 경우 완전한 초기화
  if (consecutiveMode && currentChallenge === 'all') {
    resetConsecutiveChallenge();
    console.log(`연속 주행 챌린지 시작! 주행1→주행2→S라인1→S라인2 순서로 완주해야 합니다.`);
    return;
  }

  console.log(`${currentChallenge} 코스 도전 시작!`);
}

function checkCourseComplete() {
  // 이미 처리되었거나 타이머가 없으면 무시
  if (!game || !challengeStartTime) return;

  const currentTime = performance.now();

  // 연속 주행 모드인 경우 (주행1 → 주행2 → S라인1 → S라인2)
  if (consecutiveMode && currentChallenge === 'all') {
    // 현재 완주한 코스의 개별 시간 계산
    let individualTime = 0;
    if (nextCourseStartTime) {
      individualTime = (currentTime - nextCourseStartTime) / 1000;
    }

    // 1단계: 주행1 완주 → 주행2 시작
    if (!game.courseAchieved.outer) {
      game.courseAchieved.outer = true;
      timeRecords.outer = individualTime;
      console.log(`✅ 1/4 주행1 완주! 시간: ${individualTime.toFixed(1)}초`);
      console.log('주행2로 이동...');

      // 주행2 시작 위치로 이동 (시계방향)
      game.car = new Car({ x: 480, y: 450, heading: Math.PI });
      game.isClockwise = true;
      game.courseCompleted = false;
      // 정지선 방향 업데이트
      game.stopLines = [
        { id: 1, x: 640, y: 445, passed: false, lightId: 1, wasOnStopLine: false, approachFrom: 'right' },
        { id: 2, x: 640, y: 90, passed: false, lightId: 2, wasOnStopLine: false, approachFrom: 'left' },
        { id: 3, x: 320, y: 90, passed: false, lightId: 3, wasOnStopLine: false, approachFrom: 'left' },
        { id: 4, x: 320, y: 445, passed: false, lightId: 4, wasOnStopLine: false, approachFrom: 'right' }
      ];
      game.currentActiveLightIndex = 3; // 4번부터 시작

      // 트랙 거리 측정 초기화
      game.trackStartPos = null;
      game.trackDistance = 0;

      // 신호등 재초기화 (랜덤으로 2개 선택)
      game.trafficLights.forEach(light => {
        light.red = false;
        light.willBeRed = false;
        light.justTurnedGreen = false;
      });
      const indices = [0, 1, 2, 3];
      for (let i = indices.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [indices[i], indices[j]] = [indices[j], indices[i]];
      }
      game.trafficLights[indices[0]].willBeRed = true;
      game.trafficLights[indices[1]].willBeRed = true;
      console.log(`🎲 주행2 신호등 선택: ${indices[0] + 1}번, ${indices[1] + 1}번이 빨간불로 변경됩니다.`);

      // 다음 코스 시간 측정 시작
      nextCourseStartTime = currentTime;
      lastCompletionTime = currentTime;
      return; // 계속 진행
    }

    // 2단계: 주행2 완주 → S라인1 시작
    if (game.courseAchieved.outer && !game.courseAchieved.outer2) {
      game.courseAchieved.outer2 = true;
      timeRecords.outer2 = individualTime;
      console.log(`✅ 2/4 주행2 완주! 시간: ${individualTime.toFixed(1)}초`);
      console.log('S라인1으로 이동...');

      // S라인1 시작 위치로 이동
      game.car = new Car({ x: 800, y: 500, heading: -Math.PI / 2 });
      game.courseCompleted = false;
      game.sTrackReachedGoal = false;

      // 다음 코스 시간 측정 시작
      nextCourseStartTime = currentTime;
      lastCompletionTime = currentTime;
      return; // 계속 진행
    }

    // 3단계: S라인1 완주 → S라인2 시작
    if (game.courseAchieved.outer2 && !game.courseAchieved.s) {
      game.courseAchieved.s = true;
      timeRecords.s = individualTime;
      console.log(`✅ 3/4 S라인1 완주! 시간: ${individualTime.toFixed(1)}초`);
      console.log('S라인2로 이동...');

      // S라인2 시작 위치로 이동
      game.car = new Car({ x: 80, y: 65, heading: Math.PI / 2 });
      game.courseCompleted = false;
      game.sTrackReachedGoal = false;

      // 다음 코스 시간 측정 시작
      nextCourseStartTime = currentTime;
      lastCompletionTime = currentTime;
      return; // 계속 진행
    }

    // 4단계: S라인2 완주 → 전체 완주
    if (game.courseAchieved.s && !game.courseAchieved.s2) {
      game.courseAchieved.s2 = true;
      timeRecords.s2 = individualTime;
      console.log(`✅ 4/4 S라인2 완주! 시간: ${individualTime.toFixed(1)}초`);

      // 전체 시간 계산 (각 코스 시간의 합)
      const totalTime = (timeRecords.outer || 0) + (timeRecords.outer2 || 0) +
                       (timeRecords.s || 0) + (timeRecords.s2 || 0);

      timeRecords.all = totalTime;
      updateTimeDisplay('all', totalTime);
      showSuccessMessage(`🎉 전체 코스 완주! (주행1→주행2→S라인1→S라인2)`, totalTime);
      challengeStartTime = null; // 타이머 정지 (중복 호출 방지)
      console.log(`전체 완주 시간: ${totalTime.toFixed(1)}초 (주행1: ${timeRecords.outer.toFixed(1)}s, 주행2: ${timeRecords.outer2.toFixed(1)}s, S라인1: ${timeRecords.s.toFixed(1)}s, S라인2: ${timeRecords.s2.toFixed(1)}s)`);
      return;
    }
  } else {
    // 개별 코스 모드
    const courseTime = (currentTime - challengeStartTime) / 1000;
    timeRecords[currentChallenge] = courseTime;
    updateTimeDisplay(currentChallenge, courseTime);
    showSuccessMessage(`🎉 ${getCourseDisplayName(currentChallenge)} 완주!`, courseTime);
    challengeStartTime = null; // 타이머 정지 (중복 호출 방지)
    console.log(`${currentChallenge} 완주 시간 기록: ${courseTime.toFixed(1)}초`);
  }
}

function getCourseDisplayName(course) {
  const names = {
    outer: '주행1',
    outer2: '주행2',
    s: 'S라인1',
    s2: 'S라인2',
    all: '전체 코스'
  };
  return names[course] || course;
}

function showSuccessMessage(message, time) {
  if (!successOverlay || !successTitle || !successTime) return;

  const displayTime = (time && time > 0) ? time.toFixed(1) : '0.0';

  successTitle.textContent = message;
  successTime.textContent = `시간: ${displayTime}초`;

  successOverlay.classList.remove('hidden');

  setTimeout(() => {
    successOverlay.classList.add('hidden');
    console.log('성공 메시지 숨김 완료');
  }, 3000);
}

function updateTimeDisplay(course, time) {
  const recordElement = document.getElementById(`time-record-${course}`);
  if (recordElement) {
    recordElement.textContent = `${time.toFixed(1)}초`;
    recordElement.classList.add('completed');
  }
}

// 페이지 로드 완료 후 게임 초기화
document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM 로드 완료');
  initializeGame();
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGame);
} else {
  initializeGame();
}
