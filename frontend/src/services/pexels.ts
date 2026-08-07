/**
 * Pexels API 服务 — 搜索真实照片用于 UI 设计
 * API 文档: https://www.pexels.com/api/documentation/
 */

const PEXELS_API_KEY = import.meta.env.VITE_PEXELS_API_KEY || '';
const PEXELS_BASE = 'https://api.pexels.com/v1';

export interface PexelsPhoto {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographer_url: string;
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  alt: string;
}

export interface PexelsResult {
  photos: PexelsPhoto[];
  total_results: number;
  page: number;
  per_page: number;
}

/** 搜索照片 */
export async function searchPhotos(query: string, perPage = 15, page = 1): Promise<PexelsResult> {
  const url = `${PEXELS_BASE}/search?query=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  if (!resp.ok) throw new Error(`Pexels API error: ${resp.status}`);
  return resp.json();
}

/** 获取精选照片 */
export async function getCuratedPhotos(perPage = 15, page = 1): Promise<PexelsResult> {
  const url = `${PEXELS_BASE}/curated?per_page=${perPage}&page=${page}`;
  const resp = await fetch(url, {
    headers: { Authorization: PEXELS_API_KEY },
  });
  if (!resp.ok) throw new Error(`Pexels API error: ${resp.status}`);
  return resp.json();
}

/** 按学科关键词搜索配图 */
const DISCIPLINE_QUERIES: Record<string, string> = {
  philosophy: 'ancient philosophy statue',
  economics: 'finance chart graph',
  law: 'law books justice scale',
  education: 'university library study',
  literature: 'classic books writing',
  history: 'ancient ruins archaeology',
  science: 'laboratory microscope science',
  engineering: 'engineering blueprint technology',
  agriculture: 'agriculture farming crops',
  medicine: 'medical research hospital',
  management: 'business meeting strategy',
  art: 'art gallery painting',
  military: 'military strategy map',
};

export async function getDisciplineImage(disciplineId: string): Promise<string | null> {
  try {
    const query = DISCIPLINE_QUERIES[disciplineId] || 'academic research';
    const result = await searchPhotos(query, 1);
    if (result.photos.length > 0) {
      return result.photos[0].src.landscape;
    }
    return null;
  } catch {
    return null;
  }
}

/** 搜索科研主题配图 */
export async function getResearchImage(topic: string): Promise<string | null> {
  try {
    const result = await searchPhotos(topic, 1);
    if (result.photos.length > 0) {
      return result.photos[0].src.medium;
    }
    return null;
  } catch {
    return null;
  }
}
