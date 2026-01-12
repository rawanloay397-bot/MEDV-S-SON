
export interface AnalysisBatch {
  id: string;
  pageIndices: number[];
  imageUrls: string[];
  status: 'pending' | 'processing' | 'completed' | 'error';
  result?: string;
  error?: string;
}

export interface PDFFile {
  name: string;
  size: number;
  totalPages: number;
  pagesAsImages: string[]; // Base64 strings
}
