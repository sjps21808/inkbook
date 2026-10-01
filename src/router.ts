import { useEffect, useState } from 'preact/hooks';

export type Route = { name: 'library' } | { name: 'notebook'; id: string };

export function parseHash(hash: string): Route {
  const m = /^#\/notebook\/([^/]+)$/.exec(hash);
  return m ? { name: 'notebook', id: decodeURIComponent(m[1]) } : { name: 'library' };
}

export const notebookHash = (id: string) => `#/notebook/${encodeURIComponent(id)}`;

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseHash(location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}
