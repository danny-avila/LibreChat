import * as React from "react";
export interface PresenceProps {
    children: React.ReactElement | ((props: {
        present: boolean;
    }) => React.ReactElement);
    present: boolean;
}
export const Presence: React.FC<PresenceProps>;

//# sourceMappingURL=index.d.ts.map
