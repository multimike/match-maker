// What the organiser's screens know about the cloud: who is signed in, the club's settings, and
// what can be changed there. null when the app runs on one device. No Firebase imports, so the
// screens can use it without loading Firebase.

import { createContext, useContext } from 'react';

export interface CloudInfo {
  email: string;
  owner: string;
  organisers: string[];
  joinCode: string;
  setOrganisers(emails: string[]): Promise<void>;
  replaceJoinCode(): Promise<void>;
  signOut(): Promise<void>;
}

export const CloudContext = createContext<CloudInfo | null>(null);

export function useCloud(): CloudInfo | null {
  return useContext(CloudContext);
}

/** The link in the QR code: opens the player view on this site and joins with the code. */
export function joinLink(code: string): string {
  return `${location.origin}${location.pathname}#/join/${code}`;
}

/** The TV link: the court display, joined with the same code, for a device at the TV. */
export function tvLink(code: string): string {
  return `${location.origin}${location.pathname}#/tv/${code}`;
}

/** Whether this device last joined as a player or a TV, or signed in as an organiser. */
export const ROLE_KEY = 'matchmaker.role';
