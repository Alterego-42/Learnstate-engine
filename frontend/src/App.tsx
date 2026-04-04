import { useCallback, useEffect, useState } from 'react';
import { ExecutionPage } from './components/ExecutionPage';
import { SessionReportPage } from './components/SessionReportPage';
import { FALLBACK_SESSION_ID } from './config/demo';

type ViewMode = 'execution' | 'report';

interface RouteState {
  view: ViewMode;
  sessionId: string;
}

function readRouteState(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const view = params.get('view') === 'report' ? 'report' : 'execution';
  const sessionId = params.get('sessionId') ?? (view === 'report' ? FALLBACK_SESSION_ID : '');
  return { view, sessionId };
}

function writeRouteState(next: RouteState) {
  const params = new URLSearchParams();
  params.set('view', next.view);
  if (next.sessionId) {
    params.set('sessionId', next.sessionId);
  }
  const query = params.toString();
  const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
  window.history.pushState(null, '', nextUrl);
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => readRouteState());

  useEffect(() => {
    const handlePopState = () => {
      setRoute(readRouteState());
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, []);

  const navigate = useCallback((next: RouteState) => {
    writeRouteState(next);
    setRoute(next);
  }, []);

  if (route.view === 'report') {
    return (
      <SessionReportPage
        sessionId={route.sessionId}
        onSessionIdChange={(sessionId) => navigate({ view: 'report', sessionId })}
        onBack={() => navigate({ view: 'execution', sessionId: route.sessionId })}
      />
    );
  }

  return (
    <ExecutionPage
      onOpenReport={(sessionId) => navigate({ view: 'report', sessionId })}
    />
  );
}
