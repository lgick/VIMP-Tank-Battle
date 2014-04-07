module.exports = [
  {
    vote: 'status',
    title: 'Сменить команду, статус',
    key: 'status',
    value: ['team1', 'team2', 'spectator'],
    next: null
  },
  {
    vote: 'remap',
    title: 'Предложить новую карту',
    key: 'map',
    value: ['arena', 'arena_2.0', 'berlin'],
    next: null
  },
  {
    vote: 'ban',
    title: 'Предложить забанить игрока',
    key: 'user',
    value: 'users',
    next: {
      title: 'Причина бана',
      key: 'reason',
      value: ['ЧИТЕР', 'Лузер', 'Флудер', 'Lol', 'lamer', 'bot', 'HIPSTER'],
      next: {
        title: 'Время бана (в минутах)',
        key: 'time',
        value: [1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048, 4096, 8192, 16384],
        next: null
      }
    }
  }
];
