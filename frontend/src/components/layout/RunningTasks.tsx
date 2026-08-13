/**
 * 已保留为兼容导出。v0.03 的侧栏只呈现主导航与本机后端状态，
 * 进行中的任务在任务/项目工作区中查看，避免侧栏变成第二个滚动列表。
 */


export function relativeTime(iso: string | number | null): string {
  if (iso == null || iso === '') return '';
  const then = typeof iso === 'number' ? iso : new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) return '刚刚';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function RunningTasks() {
  return null;
}
