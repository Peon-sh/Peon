'use client';

import { use } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getInvitation, acceptInvitation } from '@/services/api/invitation';
import { useAuthStore } from '@/store/auth';

export default function AcceptInvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();
  const qc = useQueryClient();
  const { setCurrentWorkspace } = useAuthStore();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['invitation', token],
    queryFn: () => getInvitation(token),
    retry: false,
  });

  const acceptMut = useMutation({
    mutationFn: () => acceptInvitation(token),
    onSuccess: async (res) => {
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      if (res.workspaceId) setCurrentWorkspace(res.workspaceId);
      toast.success('Invitation accepted');
      router.replace(res.projectId ? `/projects/${res.projectId}` : '/');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : 'Failed'),
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>You&apos;ve been invited</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading && <p className="text-muted-foreground text-sm">Loading…</p>}
          {isError && <p className="text-destructive text-sm">This invitation is invalid or expired.</p>}
          {data && (
            <>
              <p className="text-sm">
                Join <span className="font-medium">{data.target}</span> as{' '}
                <span className="font-medium">{data.role}</span>.
              </p>
              {data.status !== 'PENDING' ? (
                <p className="text-muted-foreground text-sm">
                  This invitation is no longer active ({data.status.toLowerCase()}).
                </p>
              ) : (
                <Button
                  className="w-full"
                  onClick={() => acceptMut.mutate()}
                  disabled={acceptMut.isPending}
                >
                  Accept invitation
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
