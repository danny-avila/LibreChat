import {createContext as $7Gjcd$createContext, createElement as $7Gjcd$createElement, useContext as $7Gjcd$useContext} from "react";


const $f631663db3294ace$var$DirectionContext = /*#__PURE__*/ $7Gjcd$createContext(undefined);
/* -------------------------------------------------------------------------------------------------
 * Direction
 * -----------------------------------------------------------------------------------------------*/ const $f631663db3294ace$export$c760c09fdd558351 = (props)=>{
    const { dir: dir , children: children  } = props;
    return /*#__PURE__*/ $7Gjcd$createElement($f631663db3294ace$var$DirectionContext.Provider, {
        value: dir
    }, children);
};
/* -----------------------------------------------------------------------------------------------*/ function $f631663db3294ace$export$b39126d51d94e6f3(localDir) {
    const globalDir = $7Gjcd$useContext($f631663db3294ace$var$DirectionContext);
    return localDir || globalDir || 'ltr';
}
const $f631663db3294ace$export$2881499e37b75b9a = $f631663db3294ace$export$c760c09fdd558351;




export {$f631663db3294ace$export$b39126d51d94e6f3 as useDirection, $f631663db3294ace$export$2881499e37b75b9a as Provider, $f631663db3294ace$export$c760c09fdd558351 as DirectionProvider};
//# sourceMappingURL=index.mjs.map
