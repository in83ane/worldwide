import { SupabaseClient } from '@supabase/supabase-js';

/**
 * อัพโหลดรูปงานไป Supabase Storage และคืน public URL
 * @param supabase  - Supabase client instance
 * @param file      - ไฟล์รูปภาพ
 * @param workId    - ID ของงาน
 * @param type      - 'start' หรือ 'complete'
 */
export async function uploadWorkPhoto(
  supabase: SupabaseClient,
  file: File,
  workId: string,
  type: 'start' | 'complete'
): Promise<string> {
  const ext = file.name.split('.').pop() ?? 'jpg';
  const filename = `${workId}_${type}_${Date.now()}.${ext}`;
  const path = `work-photos/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from('work-photos')
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(`Upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from('work-photos').getPublicUrl(path);
  return data.publicUrl;
}