import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { authApi } from '@/infrastructure/api';
import { Field } from '@/presentation/components/common';
import { Button } from '@/presentation/components/ui/button';
import { Input } from '@/presentation/components/ui/input';

export function LoginPage(props: { needsSetup: boolean; onAuthenticated: () => void }) {
  const { needsSetup } = props;
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const submit = useMutation({
    mutationFn: () => (needsSetup ? authApi.setup : authApi.login)({ username, password }),
    onSuccess: props.onAuthenticated,
  });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit.mutate();
  };

  return (
    <main className="bg-sidebar text-sidebar-foreground grid min-h-dvh place-items-center p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4">
        <div>
          <h1 className="font-display text-5xl font-bold tracking-tight text-white">Ayko</h1>
          <p className="mt-2">
            {needsSetup
              ? 'Créez le compte administrateur. Il ne pourra plus être créé depuis cet écran.'
              : 'Connectez-vous pour administrer la maison.'}
          </p>
        </div>
        <Field label="Identifiant" htmlFor="username">
          <Input
            id="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
        </Field>
        <Field
          label="Mot de passe"
          htmlFor="password"
          hint={needsSetup ? '8 caractères minimum' : undefined}
        >
          <Input
            id="password"
            type="password"
            autoComplete={needsSetup ? 'new-password' : 'current-password'}
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </Field>
        {submit.isError && (
          <p role="alert" className="text-led-down text-sm">
            {submit.error.message}
          </p>
        )}
        <Button
          type="submit"
          disabled={submit.isPending}
          className="bg-[#e2a03f] text-[#18232c] hover:bg-[#eab563] w-full"
        >
          {needsSetup ? 'Créer le compte' : 'Se connecter'}
        </Button>
      </form>
    </main>
  );
}
