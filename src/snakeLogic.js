export const GRID_SIZE = 16;
export const INITIAL_DIRECTION = "right";

const DIRECTION_VECTORS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE_DIRECTIONS = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export function createInitialState(randomFn = Math.random) {
  const snake = [
    { x: 2, y: 8 },
    { x: 1, y: 8 },
    { x: 0, y: 8 },
  ];

  return {
    gridSize: GRID_SIZE,
    snake,
    direction: INITIAL_DIRECTION,
    queuedDirection: INITIAL_DIRECTION,
    food: getRandomFoodPosition(snake, GRID_SIZE, randomFn),
    score: 0,
    isPaused: false,
    isGameOver: false,
  };
}

export function queueDirection(currentDirection, nextDirection, snakeLength) {
  if (!DIRECTION_VECTORS[nextDirection]) {
    return currentDirection;
  }

  if (snakeLength > 1 && OPPOSITE_DIRECTIONS[currentDirection] === nextDirection) {
    return currentDirection;
  }

  return nextDirection;
}

export function stepGame(state, randomFn = Math.random) {
  if (state.isPaused || state.isGameOver) {
    return state;
  }

  const direction = state.queuedDirection;
  const vector = DIRECTION_VECTORS[direction];
  const currentHead = state.snake[0];
  const nextHead = {
    x: currentHead.x + vector.x,
    y: currentHead.y + vector.y,
  };
  const ateFood = positionsMatch(nextHead, state.food);
  const collisionBody = ateFood ? state.snake : state.snake.slice(0, -1);

  if (
    isOutOfBounds(nextHead, state.gridSize) ||
    hitsSnake(nextHead, collisionBody)
  ) {
    return {
      ...state,
      direction,
      isGameOver: true,
    };
  }

  const nextSnake = [nextHead, ...state.snake];

  if (!ateFood) {
    nextSnake.pop();
  }

  return {
    ...state,
    snake: nextSnake,
    direction,
    queuedDirection: direction,
    food: ateFood
      ? getRandomFoodPosition(nextSnake, state.gridSize, randomFn)
      : state.food,
    score: ateFood ? state.score + 1 : state.score,
  };
}

export function togglePause(state) {
  if (state.isGameOver) {
    return state;
  }

  return {
    ...state,
    isPaused: !state.isPaused,
  };
}

export function getRandomFoodPosition(snake, gridSize, randomFn = Math.random) {
  const freeCells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      if (!snake.some((segment) => segment.x === x && segment.y === y)) {
        freeCells.push({ x, y });
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.floor(randomFn() * freeCells.length);
  return freeCells[index];
}

export function isOutOfBounds(position, gridSize) {
  return (
    position.x < 0 ||
    position.y < 0 ||
    position.x >= gridSize ||
    position.y >= gridSize
  );
}

export function hitsSnake(position, snake) {
  return snake.some((segment) => positionsMatch(segment, position));
}

export function positionsMatch(a, b) {
  return Boolean(a) && Boolean(b) && a.x === b.x && a.y === b.y;
}
