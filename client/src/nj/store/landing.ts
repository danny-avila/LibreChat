import { atomWithLocalStorage } from '~/store/utils';

/** Whether the extra info collapsible is open on the landing page */
export const landingHelpOpen = atomWithLocalStorage('landingHelpOpen', false);

/** Whether the new updates widget has been dismissed */
export const newUpdatesWidgetDismissed = atomWithLocalStorage('newUpdatesWidgetDismissed', false);
