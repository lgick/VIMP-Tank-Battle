const MESSAGE_CODES = {
  TEAMS_TEAM_FULL: 's:0', // 'Team {0} is full. Your current team: {1}'
  TEAMS_YOUR_TEAM: 's:1', // 'Your team: {0}'
  TEAMS_NEW_TEAM: 's:2', // 'Your new team: {0}'
  TEAMS_NOW_SPECTATOR: 's:3', // 'Your new status: spectator'

  TIMERS_CURRENT_MAP: 't:0', // 'Current map: {0}'
  TIMERS_NEW_ROUND: 't:1', // 'New round'

  VOTE_ACCEPTED: 'v:0', // 'Your vote has been accepted!'
  VOTE_MAP_IS_ACTIVE: 'v:1', // 'Map {0} is now active'
  VOTE_STARTED: 'v:2', // 'Vote for a new map has started'
  VOTE_UNAVAILABLE: 'v:3', // 'Map change is temporarily unavailable'
  VOTE_FINISHED: 'v:4', // 'Vote finished! Next map: {0}'
  VOTE_NO_RESULT: 'v:5', // 'Vote ended with no result'

  COMMANDS_NOT_FOUND: 'c:0', // 'Command not found'

  NAME_INVALID: 'n:0', // 'Invalid name'
  NAME_CHANGED: 'n:1', // '{0} changed name to {1}'

  BOT_INVALID_COUNT: 'b:0', // Invalid bot count
  BOT_INVALID_TEAM: 'b:1', // Invalid team name
  BOT_CREATED_FOR_TEAM: 'b:2', // {0} created {1} bot(s) for {2}
  BOT_REMOVED_FROM_TEAM: 'b:3', // {0} removed all bots from {1}
  BOT_CREATED: 'b:4', // {0} created {1} bot(s)
  BOT_REMOVED: 'b:5', // {0} removed all bots
};

/**
 * Собирает финальную строку системного сообщения из ключа и параметров.
 * @param {string} messageKey - Ключ из объекта MESSAGE_CODES
 * @param {Array<string>} [params=[]] - Массив с параметрами для сообщения.
 * @returns {string|null} Готовая строка для отправки клиенту
 * (например, 'n:1:Player1,Player2')
 */
export function buildSystemMessage(key, params = []) {
  return params.length
    ? `${MESSAGE_CODES[key]}:${params.join(',')}`
    : MESSAGE_CODES[key];
}
