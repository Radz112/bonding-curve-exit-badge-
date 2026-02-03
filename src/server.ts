import app from './app';
import { CONFIG } from './config/constants';

app.listen(CONFIG.PORT, () => {
  console.log(`[curve-exit-badge] v2 running on port ${CONFIG.PORT}`);
});
