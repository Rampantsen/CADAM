import { useConversation } from '@/contexts/ConversationContext';
import {
  downloadLocalConversationFile,
  isLocalApiEnabled,
  listLocalConversationFiles,
} from '@/lib/localApi';
import { supabase } from '@/lib/supabase';
import { useQuery } from '@tanstack/react-query';

export const useGlbPreview = ({ id }: { id?: string }) => {
  const { conversation } = useConversation();

  const query = useQuery({
    queryKey: [
      'preview',
      isLocalApiEnabled ? 'local' : 'supabase',
      conversation.id,
      id,
    ],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;

      if (isLocalApiEnabled) {
        const files = await listLocalConversationFiles(conversation.id);
        const preview = files.previews
          .filter(
            (item) => item.mesh_id === id && item.status === 'success',
          )
          .sort(
            (a, b) =>
              new Date(b.updated_at).getTime() -
              new Date(a.updated_at).getTime(),
          )[0];

        if (!preview) return null;

        const downloadStart = Date.now();
        const previewBlob = await downloadLocalConversationFile(
          conversation.id,
          'previews',
          preview.id,
        );
        const downloadEnd = Date.now();
        const downloadTime = downloadEnd - downloadStart;

        return {
          blob: previewBlob,
          updatedAt: new Date(preview.updated_at).getTime() + downloadTime,
        };
      }

      // Get most recent successful preview (handles multiple previews per mesh)
      const { data: previews, error: previewError } = await supabase
        .from('previews')
        .select('*')
        .eq('mesh_id', id)
        .eq('status', 'success')
        .order('updated_at', { ascending: false })
        .limit(1);

      const preview = previews?.[0];

      if (previewError || !preview) return null;

      const downloadStart = Date.now();

      const { data: previewBlob } = await supabase.storage
        .from('previews')
        .download(
          `${preview.user_id}/${preview.conversation_id}/${preview.id}.glb`,
        );

      const downloadEnd = Date.now();
      const downloadTime = downloadEnd - downloadStart;

      return {
        blob: previewBlob || null,
        updatedAt: new Date(preview.updated_at).getTime() + downloadTime,
      };
    },
    // Poll for preview availability during mesh generation
    refetchInterval: (query) => {
      // Only poll if we don't have a successful preview yet
      return !query.state.data ? 3000 : false;
    },
  });

  return {
    data: query.data?.blob || null,
    updatedAt: query.data?.updatedAt || null,
    isLoading: query.isLoading,
    error: query.error,
  };
};
