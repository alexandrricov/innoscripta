/**
 * The host-owned session, threaded once and read wherever it is needed.
 *
 * The shell pushes it in as a prop on the exposed `./App`. From there it becomes
 * a context, because the value is needed in a grid cell twelve levels down and
 * passing it through every intermediate component would be prop drilling for no
 * gain.
 *
 * The context is created here, inside this remote, rather than shared with the
 * shell or the other remote. Federation shares one React instance, but a context
 * object is module state: sharing one would mean both sides resolving the same
 * module instance, which is a build-time coincidence to depend on for something
 * this small. A prop at the boundary and a context inside is two mechanisms that
 * each work where they are used.
 *
 * The default is the standalone one, so running on port 3002 with no host needs
 * no special case anywhere below.
 */

import { DEFAULT_SESSION, type HostSession } from '@baseline/contracts';
import { createContext, type ReactNode, useContext } from 'react';

const SessionContext = createContext<HostSession>(DEFAULT_SESSION);

interface SessionProviderProps {
  readonly session: HostSession;
  readonly children: ReactNode;
}

export function SessionProvider({ session, children }: SessionProviderProps) {
  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export function useHostSession(): HostSession {
  return useContext(SessionContext);
}
