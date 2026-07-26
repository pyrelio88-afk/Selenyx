// Journal — JSONL 事件日志持久化。
// 每个调查一个目录：journal.jsonl 追加写，可随时 replay 重建图谱。
import fs from 'node:fs';
import path from 'node:path';

export class Journal {
  constructor(filePath) {
    this.filePath = filePath;
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
  }

  /** 追加一条记录。kind: 'atom' | 'relation' | 'commitment' | 'note' */
  append(kind, data) {
    const line = JSON.stringify({ kind, data, ts: Date.now() / 1000 });
    fs.appendFileSync(this.filePath, `${line}\n`, 'utf8');
  }

  /** 重放日志。坏行跳过（诚实记录于 skipped）。 */
  replay() {
    const out = { atoms: [], relations: [], commitments: [], notes: [], skipped: 0 };
    if (!fs.existsSync(this.filePath)) return out;
    const text = fs.readFileSync(this.filePath, 'utf8');
    for (const line of text.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const rec = JSON.parse(trimmed);
        if (rec.kind === 'atom') out.atoms.push(rec.data);
        else if (rec.kind === 'relation') out.relations.push(rec.data);
        else if (rec.kind === 'commitment') out.commitments.push(rec.data);
        else out.notes.push(rec.data);
      } catch {
        out.skipped += 1;
      }
    }
    return out;
  }
}

/** 调查目录约定：~/.selenyx/investigations/<id>/ */
export function investigationDir(homeDir, id) {
  return path.join(homeDir, '.selenyx', 'investigations', id);
}
