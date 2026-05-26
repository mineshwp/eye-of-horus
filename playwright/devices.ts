export const DEVICES = [
  {
    name: 'desktop' as const,
    viewport: { width: 1440, height: 900 },
    isMobile: false,
    hasTouch: false,
    userAgent: undefined as string | undefined,
  },
  {
    name: 'tablet' as const,
    viewport: { width: 768, height: 1024 },
    isMobile: false,
    hasTouch: true,
    userAgent: undefined as string | undefined,
  },
  {
    name: 'mobile' as const,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
] as const;

export type DeviceName = 'desktop' | 'tablet' | 'mobile';

export type DeviceConfig = typeof DEVICES[number];
