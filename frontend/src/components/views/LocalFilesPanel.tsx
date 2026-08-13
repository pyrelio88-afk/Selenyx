/** 工具里的本地附件：来自文献 PDF/图片，不另造空壳图库。 */

import { useAppStore } from '@stores/appStore';
import { EmptyGuide } from '@components/ui/EmptyGuide';
import { listLocalFiles } from './listLocalFiles';

export function LocalFilesPanel() {
  const references = useAppStore((s) => s.references);
  const requestPdfOpen = useAppStore((s) => s.requestPdfOpen);
  const items = listLocalFiles(references);

  if (items.length === 0) {
    return (
      <EmptyGuide title="还没有本地附件">
        PDF 和图片挂在文献条目上。导入文献并附上文件后，会集中出现在这里。
      </EmptyGuide>
    );
  }

  return (
    <ul className="local-files-list">
      {items.map((item) => (
        <li key={`${item.referenceId}-${item.path}`}>
          <button
            type="button"
            className="local-files-item"
            onClick={() => {
              if (item.kind === 'pdf') requestPdfOpen(item.referenceId, 1);
            }}
            disabled={item.kind !== 'pdf'}
            title={item.path}
          >
            <b>{item.filename}</b>
            <span>{item.title} · {item.kind === 'pdf' ? 'PDF' : item.kind === 'image' ? '图片' : '文件'}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
