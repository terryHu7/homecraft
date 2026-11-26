import home from '../../home.config.js';
import { STATIONS } from './layout.js';

export default {
  ...home,
  name: 'Swarga',
  start: { weather: 'clear', time: 'dusk' },
  dock: STATIONS.filter(({ id }) => !['rambha', 'urvashi', 'menaka', 'tilottama'].includes(id)).map(({ id }) => id),
};
