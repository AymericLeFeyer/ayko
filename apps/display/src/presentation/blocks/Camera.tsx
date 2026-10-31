import { Video, VideoOff } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { coreApi } from '@/infrastructure/coreApi';

export const CameraContext = createContext<{
  token: string;
  focused: string | null;
  focus: (cameraId: string | null) => void;
}>({ token: '', focused: null, focus: () => {} });

type Feed = { status: 'loading' } | { status: 'failed' } | { status: 'live'; url: string };

/**
 * No automatic retry: each attempt reaches Home Assistant, a tap starts a new one. The ticket
 * is single-use, so a new attempt or a remount asks for another one.
 */
function useCameraFeed(cameraId: string, active: boolean) {
  const { token } = useContext(CameraContext);
  const [feed, setFeed] = useState<Feed>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;
    setFeed({ status: 'loading' });
    coreApi.cameraTicket(token, cameraId).then(
      ({ url }) => !cancelled && setFeed({ status: 'live', url }),
      () => !cancelled && setFeed({ status: 'failed' }),
    );
    return () => {
      cancelled = true;
    };
  }, [token, cameraId, active, attempt]);

  return {
    feed,
    failed: () => setFeed({ status: 'failed' }),
    retry: () => setAttempt((value) => value + 1),
  };
}

function CameraView(props: { feed: Feed; name: string; onError: () => void }) {
  const { feed, name, onError } = props;
  if (feed.status === 'failed') {
    return (
      <span>
        <VideoOff size={32} aria-hidden /> Caméra indisponible
      </span>
    );
  }
  if (feed.status === 'loading') return <span>Connexion…</span>;
  return <img src={feed.url} alt={`Caméra ${name}`} onError={onError} />;
}

/** While it covers the screen, the card lets go of its stream: one view is enough. */
export function CameraCard({ block }: { block: { cameraId: string; name: string } }) {
  const { focused, focus } = useContext(CameraContext);
  const { cameraId, name } = block;
  const covered = focused === cameraId;
  const { feed, failed, retry } = useCameraFeed(cameraId, !covered);
  return (
    <button
      className="camera-card"
      aria-label={`Agrandir la caméra ${name}`}
      onClick={() => (feed.status === 'failed' ? retry() : focus(cameraId))}
    >
      <span className="camera-frame">
        {!covered && <CameraView feed={feed} name={name} onError={failed} />}
      </span>
      <span className="camera-name">
        <Video size={20} aria-hidden /> {name}
      </span>
    </button>
  );
}

export function CameraFullscreen({ cameraId, name }: { cameraId: string; name: string }) {
  const { focus } = useContext(CameraContext);
  const { feed, failed } = useCameraFeed(cameraId, true);
  return (
    <button
      className="camera-fullscreen"
      aria-label={`Réduire la caméra ${name}`}
      onClick={() => focus(null)}
    >
      <CameraView feed={feed} name={name} onError={failed} />
      <span className="camera-name">
        <Video size={20} aria-hidden /> {name}
      </span>
    </button>
  );
}
