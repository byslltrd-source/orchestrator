import { createServiceClient } from './service';

// Storage configuration
export const STORAGE_BUCKET = process.env.STORAGE_BUCKET || 'orchestrator-images';
export const DEFAULT_IMAGE_FOLDER = 'images';

// Structured asset metadata stored in jsonb (e.g. tasks.images)
export interface StoredAsset {
  path: string;           // full storage path
  url: string;            // public or signed URL at time of storage
  name: string;           // original filename
  size: number;
  mime: string;
  uploadedAt: string;     // ISO
}

/**
 * Upload a file for a specific user using the privileged service client.
 * Files are stored under userId/images/ for easy isolation.
 * Returns structured metadata suitable for storing in DB (e.g. tasks.images).
 */
export async function uploadUserFile(
  userId: string,
  file: File | Blob,
  originalName?: string
): Promise<StoredAsset> {
  const service = createServiceClient();
  const safeName = (originalName || (file as File).name || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniquePath = `${userId}/${DEFAULT_IMAGE_FOLDER}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await (service.storage.from(STORAGE_BUCKET) as any).upload(uniquePath, file, {
    upsert: false,
    contentType: (file as File).type || 'application/octet-stream',
  });

  if (uploadError) {
    throw new Error(`Storage upload failed: ${uploadError.message}`);
  }

  // Prefer public URL for vision (OpenAI needs fetchable URL). 
  // For sensitive files, switch to getSignedUrl.
  const { data: urlData } = (service.storage.from(STORAGE_BUCKET) as any).getPublicUrl(uniquePath);

  let finalUrl = urlData?.publicUrl;

  if (!finalUrl) {
    // Private bucket or no public: generate fresh signed URL (1 hour, sufficient for LLM vision calls)
    const { data: signed } = await (service.storage.from(STORAGE_BUCKET) as any).createSignedUrl(uniquePath, 60 * 60);
    if (signed?.signedUrl) {
      finalUrl = signed.signedUrl;
    } else {
      throw new Error('Could not generate accessible URL (public or signed) for stored file. Check bucket policies.');
    }
  }

  return {
    path: uniquePath,
    url: finalUrl,
    name: safeName,
    size: (file as File).size || 0,
    mime: (file as File).type || 'application/octet-stream',
    uploadedAt: new Date().toISOString(),
  };
}

/**
 * Delete a file by its storage path (user-scoped).
 */
export async function deleteUserFile(path: string): Promise<void> {
  const service = createServiceClient();
  const { error } = await (service.storage.from(STORAGE_BUCKET) as any).remove([path]);
  if (error) {
    console.error('Storage delete failed:', error);
    // Non-fatal for most cases
  }
}

/**
 * List files for a user (useful for future "my assets" UI).
 */
export async function listUserFiles(userId: string, folder = DEFAULT_IMAGE_FOLDER) {
  const service = createServiceClient();
  const prefix = `${userId}/${folder}/`;
  const { data, error } = await (service.storage.from(STORAGE_BUCKET) as any).list(prefix, {
    limit: 100,
    offset: 0,
  });
  if (error) throw error;
  return data || [];
}

/**
 * Generate a fresh signed URL for a stored asset (for private buckets or time-limited access).
 */
export async function getSignedAssetUrl(path: string, expiresInSeconds = 3600): Promise<string> {
  const service = createServiceClient();
  const { data, error } = await (service.storage.from(STORAGE_BUCKET) as any).createSignedUrl(path, expiresInSeconds);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message}`);
  }
  return data.signedUrl;
}

/**
 * Get a fresh, usable URL for vision (re-signs if the stored one is expired or for private buckets).
 * Use this before passing images to LLM calls in long-running agents.
 */
export async function getVisionUrl(asset: StoredAsset | { path: string; url?: string }): Promise<string> {
  if (asset.url && asset.url.includes('token=')) {
    // Looks like a signed URL, generate fresh one for safety in long runs
    return getSignedAssetUrl(asset.path);
  }
  // Assume public or still valid
  if (asset.url) return asset.url;
  return getSignedAssetUrl(asset.path);
}

/**
 * Delete all assets for a user (e.g., on account deletion or bulk cleanup).
 * Use with care.
 */
export async function deleteAllUserAssets(userId: string): Promise<void> {
  const service = createServiceClient();
  const prefix = `${userId}/`;
  const { data: files } = await (service.storage.from(STORAGE_BUCKET) as any).list(prefix, { limit: 1000 });
  if (files && files.length > 0) {
    const paths = files.map((f: any) => `${prefix}${f.name}`);
    await (service.storage.from(STORAGE_BUCKET) as any).remove(paths);
  }
}

/**
 * Cleanup old assets for a specific task (call when task is deleted or archived).
 */
export async function cleanupTaskAssets(taskImages: StoredAsset[] | string[] | null | undefined): Promise<void> {
  if (!taskImages || !Array.isArray(taskImages) || taskImages.length === 0) return;
  const service = createServiceClient();
  const paths: string[] = [];
  for (const img of taskImages) {
    if (typeof img === 'string') {
      // legacy url - can't easily delete without path, skip or parse
      continue;
    }
    if (img && typeof img === 'object' && 'path' in img) {
      paths.push((img as StoredAsset).path);
    }
  }
  if (paths.length > 0) {
    await (service.storage.from(STORAGE_BUCKET) as any).remove(paths);
  }
}
