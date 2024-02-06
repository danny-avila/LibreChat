import { memo, useEffect } from 'react';
/**
 * A utility for rendering a drag preview image
 */ export const DragPreviewImage = memo(function DragPreviewImage({ connect , src  }) {
    useEffect(()=>{
        if (typeof Image === 'undefined') return;
        let connected = false;
        const img = new Image();
        img.src = src;
        img.onload = ()=>{
            connect(img);
            connected = true;
        };
        return ()=>{
            if (connected) {
                connect(null);
            }
        };
    });
    return null;
});

//# sourceMappingURL=DragPreviewImage.js.map