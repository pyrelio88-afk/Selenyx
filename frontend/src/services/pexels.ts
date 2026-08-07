/**
 * Remote editorial photography is intentionally disabled in the client.
 * VITE_* values are compiled into the application bundle, so a Pexels key
 * cannot be treated as private configuration here. The UI already tolerates
 * null/empty image results and can use local assets instead.
 */

const EMPTY_RESULT: PexelsResult = {
  photos: [],
  total_results: 0,
  page: 1,
  per_page: 0,
};

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
  void query;
  return { ...EMPTY_RESULT, per_page: perPage, page };
}

/** 获取精选照片 */
export async function getCuratedPhotos(perPage = 15, page = 1): Promise<PexelsResult> {
  return { ...EMPTY_RESULT, per_page: perPage, page };
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
