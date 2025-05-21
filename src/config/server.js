import VIMP from '../server/modules/index.js';

export default {
  name: 'VIMP Tank Battle',
  protocol: 'http:',
  domain: 'localhost',
  port: 3000,
  oneConnection: false,
  maxPlayers: 10,
  roundTripTime: {
    pingInterval: 3000, // интервал обновления rtt (ms)
    alpha: 0.1, // коэффициент сглаживания для алгоритма экспоненциального скользящего среднего (EMA)
  },
  VIMP,
};
