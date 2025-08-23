export interface ScreenshotRequest {
  type: 'capture_viewport' | 'capture_full_page' | 'capture_element' | 'get_page_info' | 'get_page_source' | 'get_element_source';
  tabId?: number;
  format?: 'png' | 'jpeg' | 'webp';
  selector?: string;
  index?: number;
  padding?: number;
}

export interface ScreenshotResponse {
  success: boolean;
  data?: {
    screenshot?: string; // base64 encoded image
    pageInfo?: PageInfo;
    source?: string; // HTML source
    elementBounds?: any;
  };
  error?: string;
}

export interface PageInfo {
  url: string;
  title: string;
  width: number;
  height: number;
  scrollHeight: number;
  scrollWidth: number;
}