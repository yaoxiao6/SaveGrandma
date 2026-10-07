import { createGame } from './controller';
import { createCommandSession } from './command-session';
export const { controller: gameController, simulation } = createGame();
export const gameCommands = createCommandSession(gameController);
