/**
 * 文献元数据自动抓取服务 — 通过 Crossref API 从 DOI 获取文献信息
 * 灵感来源: Zotero Connector 的自动元数据捕获
 * API: https://api.crossref.org/works/{doi}
 */

export interface FetchedReference {
  title: string;
  creators: { firstName: string; lastName: string }[];
  type: string;
  doi: string;
  publication: string;
  year: number;
  volume: string;
  issue: string;
  pages: string;
  abstract: string;
  issn: string;
  publisher: string;
  openAccess: boolean;
}

/** 从 Crossref API 通过 DOI 获取文献元数据 */
export async function fetchByDOI(doi: string): Promise<FetchedReference | null> {
  const cleanDOI = doi.trim().replace(/^https?:\/\/doi\.org\//, '').replace(/^doi:\s*/i, '');
  const url = `https://api.crossref.org/works/${encodeURIComponent(cleanDOI)}`;
  
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Selenyx/1.0 (mailto:research@selenyx.app)' },
    });
    if (!resp.ok) return null;
    
    const data = await resp.json();
    const work = data.message;
    if (!work) return null;
    
    const creators = (work.author || []).map((a: any) => ({
      firstName: a.given || '',
      lastName: a.family || '',
    }));
    
    const year = work.published?.['date-parts']?.[0]?.[0] 
      || work.published?.['date-parts']?.[0]?.[0]
      || new Date().getFullYear();
    
    const abstract = work.abstract 
      ? work.abstract.replace(/<[^>]+>/g, '') 
      : '';
    
    return {
      title: work.title?.[0] || `[Untitled] DOI: ${cleanDOI}`,
      creators,
      type: mapCrossrefType(work.type || 'journal-article'),
      doi: cleanDOI,
      publication: work['container-title']?.[0] || '',
      year,
      volume: work.volume || '',
      issue: work.issue || '',
      pages: work.page || '',
      abstract,
      issn: work.ISSN?.[0] || '',
      publisher: work.publisher || '',
      openAccess: !!work.license,
    };
  } catch {
    return null;
  }
}

/**
 * Crossref 关键词检索。仅请求文献卡片实际需要的少量结果；导入前仍由用户逐条确认，
 * 这样不会把远端检索结果自动写入本地文献库。
 */
export async function searchCrossref(query: string, maxResults = 12): Promise<FetchedReference[]> {
  const normalized = query.trim();
  if (!normalized) return [];

  const url = new URL('https://api.crossref.org/works');
  url.searchParams.set('query.bibliographic', normalized);
  url.searchParams.set('rows', String(Math.min(Math.max(maxResults, 1), 20)));
  url.searchParams.set('select', 'DOI,title,author,type,container-title,published,volume,issue,page,abstract,ISSN,publisher,license');

  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Selenyx/2.0 (mailto:research@selenyx.app)' },
    });
    if (!response.ok) return [];

    const data = await response.json();
    const items = Array.isArray(data?.message?.items) ? data.message.items : [];
    return items.map((work: any) => ({
      title: work.title?.[0] || '[Untitled]',
      creators: (work.author || []).map((author: any) => ({
        firstName: author.given || '',
        lastName: author.family || '',
      })),
      type: mapCrossrefType(work.type || 'journal-article'),
      doi: work.DOI || '',
      publication: work['container-title']?.[0] || '',
      year: work.published?.['date-parts']?.[0]?.[0] || new Date().getFullYear(),
      volume: work.volume || '',
      issue: work.issue || '',
      pages: work.page || '',
      abstract: work.abstract ? work.abstract.replace(/<[^>]+>/g, '') : '',
      issn: work.ISSN?.[0] || '',
      publisher: work.publisher || '',
      openAccess: Boolean(work.license?.length),
    }));
  } catch {
    return [];
  }
}

function mapCrossrefType(type: string): string {
  const map: Record<string, string> = {
    'journal-article': 'journalArticle',
    'book': 'book',
    'book-chapter': 'bookSection',
    'proceedings-article': 'conferencePaper',
    'dissertation': 'thesis',
    'report': 'report',
    'webpage': 'webpage',
    'posted-content': 'preprint',
  };
  return map[type] || 'journalArticle';
}

/** 从 arXiv API 搜索预印本 */
export async function searchArXiv(query: string, maxResults = 5): Promise<FetchedReference[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=${maxResults}`;
  
  try {
    const resp = await fetch(url);
    if (!resp.ok) return [];
    
    const text = await resp.text();
    const results: FetchedReference[] = [];
    
    // 简单 XML 解析（arXiv 返回 Atom XML）
    const entries = text.match(/<entry>[\s\S]*?<\/entry>/g) || [];
    for (const entry of entries) {
      const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
      const summary = entry.match(/<summary>([\s\S]*?)<\/summary>/)?.[1]?.trim() || '';
      const published = entry.match(/<published>([\s\S]*?)<\/published>/)?.[1]?.trim() || '';
      const year = published ? new Date(published).getFullYear() : new Date().getFullYear();
      const doiMatch = entry.match(/<arxiv:doi[^>]*>([^<]+)<\/arxiv:doi>/);
      const doi = doiMatch ? doiMatch[1] : '';
      const idMatch = entry.match(/<id>([^<]+)<\/id>/);
      const arxivId = idMatch ? idMatch[1].replace('http://arxiv.org/abs/', '') : '';
      
      // 作者解析
      const authorMatches = entry.match(/<author>[\s\S]*?<name>([^<]+)<\/name>[\s\S]*?<\/author>/g) || [];
      const creators = authorMatches.map((am) => {
        const name = am.match(/<name>([^<]+)<\/name>/)?.[1] || '';
        const parts = name.trim().split(/\s+/);
        return {
          firstName: parts.slice(0, -1).join(' '),
          lastName: parts[parts.length - 1] || '',
        };
      });
      
      results.push({
        title,
        creators,
        type: 'preprint',
        doi: doi || arxivId,
        publication: `arXiv:${arxivId}`,
        year,
        volume: '',
        issue: '',
        pages: '',
        abstract: summary,
        issn: '',
        publisher: 'arXiv',
        openAccess: true,
      });
    }
    
    return results;
  } catch {
    return [];
  }
}
