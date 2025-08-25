export interface ScreenshotRequest {
  type: 'capture_viewport' | 'capture_full_page' | 'get_page_info' | 'get_page_source' | 'get_all_tabs';
  url?: string;  // URL of tab to capture (will auto-switch to this tab)
  tabId?: number;
  format?: 'png' | 'jpeg' | 'webp';
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