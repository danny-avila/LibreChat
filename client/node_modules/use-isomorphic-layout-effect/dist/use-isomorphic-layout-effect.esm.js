import { useLayoutEffect, useEffect } from 'react';

var index = typeof document !== 'undefined' ? useLayoutEffect : useEffect;

export default index;
