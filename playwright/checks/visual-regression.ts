import * as fs from 'fs';
import * as path from 'path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

export interface DiffResult {
  diffPercentage: number;
  diffPath: string | null;
  matched: boolean;
  threshold: number;
}

export async function compareScreenshots(
  baselinePath: string,
  currentPath: string,
  diffPath: string,
  threshold: number = 10,
): Promise<DiffResult> {
  if (!fs.existsSync(baselinePath) || !fs.existsSync(currentPath)) {
    return { diffPercentage: 0, diffPath: null, matched: true, threshold };
  }

  const baselinePng = PNG.sync.read(fs.readFileSync(baselinePath));
  const currentPng = PNG.sync.read(fs.readFileSync(currentPath));

  // Use minimum dimensions to handle viewport size differences
  const width = Math.min(baselinePng.width, currentPng.width);
  const height = Math.min(baselinePng.height, currentPng.height);

  const diff = new PNG({ width, height });

  // Crop source images to common dimensions
  const baselineData = resizeImageData(baselinePng, width, height);
  const currentData = resizeImageData(currentPng, width, height);

  const numDiffPixels = pixelmatch(
    baselineData,
    currentData,
    diff.data,
    width,
    height,
    { threshold: 0.1, includeAA: false },
  );

  const totalPixels = width * height;
  const diffPercentage = (numDiffPixels / totalPixels) * 100;

  // Save diff image
  fs.mkdirSync(path.dirname(diffPath), { recursive: true });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));

  return {
    diffPercentage: Math.round(diffPercentage * 100) / 100,
    diffPath,
    matched: diffPercentage <= threshold,
    threshold,
  };
}

function resizeImageData(png: PNG, targetWidth: number, targetHeight: number): Buffer {
  if (png.width === targetWidth && png.height === targetHeight) {
    return png.data;
  }
  // Simple crop to target dimensions
  const result = Buffer.alloc(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcIdx = (y * png.width + x) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      result[dstIdx] = png.data[srcIdx];
      result[dstIdx + 1] = png.data[srcIdx + 1];
      result[dstIdx + 2] = png.data[srcIdx + 2];
      result[dstIdx + 3] = png.data[srcIdx + 3];
    }
  }
  return result;
}
