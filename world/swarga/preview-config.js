import home from '../../home.config.js';
import { STATIONS } from './layout.js';

export default {
  ...home,
  name: 'Swarga',
  start: { weather: 'clear', time: 'dusk' },
  dock: [...STATIONS.slice(0, 6).map(({ id }) => id), 'gandharva-musicians', 'nandana-entrance', 'kalpavriksha'],
};
