import * as $2AODx$react from "react";
import {useLayoutEffect as $2AODx$useLayoutEffect} from "@radix-ui/react-use-layout-effect";



const $1746a345f3d73bb7$var$useReactId = $2AODx$react['useId'.toString()] || (()=>undefined
);
let $1746a345f3d73bb7$var$count = 0;
function $1746a345f3d73bb7$export$f680877a34711e37(deterministicId) {
    const [id, setId] = $2AODx$react.useState($1746a345f3d73bb7$var$useReactId()); // React versions older than 18 will have client-side ids only.
    $2AODx$useLayoutEffect(()=>{
        if (!deterministicId) setId((reactId)=>reactId !== null && reactId !== void 0 ? reactId : String($1746a345f3d73bb7$var$count++)
        );
    }, [
        deterministicId
    ]);
    return deterministicId || (id ? `radix-${id}` : '');
}




export {$1746a345f3d73bb7$export$f680877a34711e37 as useId};
//# sourceMappingURL=index.mjs.map
