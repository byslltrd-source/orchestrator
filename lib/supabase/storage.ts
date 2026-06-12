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

  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    // Fallback: try signed URL (60 min)
    const { data: signed } = await (service.storage.from(STORAGE_BUCKET) as any).createSignedUrl(uniquePath, 60 * 60);
    if (!signed?.signedUrl) {
      throw new Error('Could not generate accessible URL for stored file');
    }
    // Note: signed URLs expire. For long-lived vision, prefer public bucket or re-sign on use.
  }

  return {
    path: uniquePath,
    url: publicUrl || '', // caller should handle if empty
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
