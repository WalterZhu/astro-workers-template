// 导入 ChatRoom 类
import { ChatRoom } from './src/lib/chat/ChatRoom.ts';

// 导入 Astro 生成的默认 worker
import astroWorker from './dist/_worker.js/index.js';

// 导出 Durable Object 类
export { ChatRoom };

// 导出默认的 fetch 处理函数
export default astroWorker;