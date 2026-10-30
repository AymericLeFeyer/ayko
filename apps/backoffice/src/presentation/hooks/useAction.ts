import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

/** Mutation with the house behaviour: toast on outcome, refresh of the given areas. */
export function useAction<TInput = void, TResult = unknown>(
  action: (input: TInput) => Promise<TResult>,
  options: { success?: string; invalidate?: string[]; onDone?: (result: TResult) => void } = {},
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: (result) => {
      if (options.success) toast.success(options.success);
      for (const key of options.invalidate ?? []) {
        void client.invalidateQueries({ queryKey: [key] });
      }
      options.onDone?.(result);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });
}
