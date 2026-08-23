/** The account the app is currently authenticated as.
 *
 *  Published from the auth provider, which is mounted for the whole session, so
 *  that work outliving the component which started it can still be attributed.
 *  A hook inside a screen cannot serve this: the sidebar unmounts sections as
 *  the user searches, and an identity that disappears with them either strands
 *  the work it owns or, if retained, goes stale across a sign-in and lets it be
 *  written to the next account.
 */
let sessionUserId: string | undefined;

export const setSessionUserId = (userId: string | undefined): void => {
  sessionUserId = userId;
};

/** `undefined` when signed out, or before the first authenticated render. */
export const getSessionUserId = (): string | undefined => sessionUserId;
