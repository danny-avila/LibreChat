var $inrcs$babelruntimehelpersextends = require("@babel/runtime/helpers/extends");
var $inrcs$react = require("react");
var $inrcs$radixuinumber = require("@radix-ui/number");
var $inrcs$radixuiprimitive = require("@radix-ui/primitive");
var $inrcs$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $inrcs$radixuireactcontext = require("@radix-ui/react-context");
var $inrcs$radixuireactusecontrollablestate = require("@radix-ui/react-use-controllable-state");
var $inrcs$radixuireactdirection = require("@radix-ui/react-direction");
var $inrcs$radixuireactuseprevious = require("@radix-ui/react-use-previous");
var $inrcs$radixuireactusesize = require("@radix-ui/react-use-size");
var $inrcs$radixuireactprimitive = require("@radix-ui/react-primitive");
var $inrcs$radixuireactcollection = require("@radix-ui/react-collection");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createSliderScope", () => $1791bb30e2e418d5$export$ef72632d7b901f97);
$parcel$export(module.exports, "Slider", () => $1791bb30e2e418d5$export$472062a354075cee);
$parcel$export(module.exports, "SliderTrack", () => $1791bb30e2e418d5$export$105594979f116971);
$parcel$export(module.exports, "SliderRange", () => $1791bb30e2e418d5$export$a5cf38a7a000fe77);
$parcel$export(module.exports, "SliderThumb", () => $1791bb30e2e418d5$export$2c1b491743890dec);
$parcel$export(module.exports, "Root", () => $1791bb30e2e418d5$export$be92b6f5f03c0fe9);
$parcel$export(module.exports, "Track", () => $1791bb30e2e418d5$export$13921ac0cc260818);
$parcel$export(module.exports, "Range", () => $1791bb30e2e418d5$export$9a58ef0d7ad3278c);
$parcel$export(module.exports, "Thumb", () => $1791bb30e2e418d5$export$6521433ed15a34db);












const $1791bb30e2e418d5$var$PAGE_KEYS = [
    'PageUp',
    'PageDown'
];
const $1791bb30e2e418d5$var$ARROW_KEYS = [
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight'
];
const $1791bb30e2e418d5$var$BACK_KEYS = {
    'from-left': [
        'Home',
        'PageDown',
        'ArrowDown',
        'ArrowLeft'
    ],
    'from-right': [
        'Home',
        'PageDown',
        'ArrowDown',
        'ArrowRight'
    ],
    'from-bottom': [
        'Home',
        'PageDown',
        'ArrowDown',
        'ArrowLeft'
    ],
    'from-top': [
        'Home',
        'PageDown',
        'ArrowUp',
        'ArrowLeft'
    ]
};
/* -------------------------------------------------------------------------------------------------
 * Slider
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$SLIDER_NAME = 'Slider';
const [$1791bb30e2e418d5$var$Collection, $1791bb30e2e418d5$var$useCollection, $1791bb30e2e418d5$var$createCollectionScope] = $inrcs$radixuireactcollection.createCollection($1791bb30e2e418d5$var$SLIDER_NAME);
const [$1791bb30e2e418d5$var$createSliderContext, $1791bb30e2e418d5$export$ef72632d7b901f97] = $inrcs$radixuireactcontext.createContextScope($1791bb30e2e418d5$var$SLIDER_NAME, [
    $1791bb30e2e418d5$var$createCollectionScope
]);
const [$1791bb30e2e418d5$var$SliderProvider, $1791bb30e2e418d5$var$useSliderContext] = $1791bb30e2e418d5$var$createSliderContext($1791bb30e2e418d5$var$SLIDER_NAME);
const $1791bb30e2e418d5$export$472062a354075cee = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { name: name , min: min = 0 , max: max = 100 , step: step = 1 , orientation: orientation = 'horizontal' , disabled: disabled = false , minStepsBetweenThumbs: minStepsBetweenThumbs = 0 , defaultValue: defaultValue = [
        min
    ] , value: value1 , onValueChange: onValueChange = ()=>{} , onValueCommit: onValueCommit = ()=>{} , inverted: inverted = false , ...sliderProps } = props;
    const [slider, setSlider] = $inrcs$react.useState(null);
    const composedRefs = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setSlider(node)
    );
    const thumbRefs = $inrcs$react.useRef(new Set());
    const valueIndexToChangeRef = $inrcs$react.useRef(0);
    const isHorizontal = orientation === 'horizontal'; // We set this to true by default so that events bubble to forms without JS (SSR)
    const isFormControl = slider ? Boolean(slider.closest('form')) : true;
    const SliderOrientation = isHorizontal ? $1791bb30e2e418d5$var$SliderHorizontal : $1791bb30e2e418d5$var$SliderVertical;
    const [values = [], setValues] = $inrcs$radixuireactusecontrollablestate.useControllableState({
        prop: value1,
        defaultProp: defaultValue,
        onChange: (value)=>{
            var _thumbs$valueIndexToC;
            const thumbs = [
                ...thumbRefs.current
            ];
            (_thumbs$valueIndexToC = thumbs[valueIndexToChangeRef.current]) === null || _thumbs$valueIndexToC === void 0 || _thumbs$valueIndexToC.focus();
            onValueChange(value);
        }
    });
    const valuesBeforeSlideStartRef = $inrcs$react.useRef(values);
    function handleSlideStart(value) {
        const closestIndex = $1791bb30e2e418d5$var$getClosestValueIndex(values, value);
        updateValues(value, closestIndex);
    }
    function handleSlideMove(value) {
        updateValues(value, valueIndexToChangeRef.current);
    }
    function handleSlideEnd() {
        const prevValue = valuesBeforeSlideStartRef.current[valueIndexToChangeRef.current];
        const nextValue = values[valueIndexToChangeRef.current];
        const hasChanged = nextValue !== prevValue;
        if (hasChanged) onValueCommit(values);
    }
    function updateValues(value, atIndex, { commit: commit  } = {
        commit: false
    }) {
        const decimalCount = $1791bb30e2e418d5$var$getDecimalCount(step);
        const snapToStep = $1791bb30e2e418d5$var$roundValue(Math.round((value - min) / step) * step + min, decimalCount);
        const nextValue = $inrcs$radixuinumber.clamp(snapToStep, [
            min,
            max
        ]);
        setValues((prevValues = [])=>{
            const nextValues = $1791bb30e2e418d5$var$getNextSortedValues(prevValues, nextValue, atIndex);
            if ($1791bb30e2e418d5$var$hasMinStepsBetweenValues(nextValues, minStepsBetweenThumbs * step)) {
                valueIndexToChangeRef.current = nextValues.indexOf(nextValue);
                const hasChanged = String(nextValues) !== String(prevValues);
                if (hasChanged && commit) onValueCommit(nextValues);
                return hasChanged ? nextValues : prevValues;
            } else return prevValues;
        });
    }
    return /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderProvider, {
        scope: props.__scopeSlider,
        disabled: disabled,
        min: min,
        max: max,
        valueIndexToChangeRef: valueIndexToChangeRef,
        thumbs: thumbRefs.current,
        values: values,
        orientation: orientation
    }, /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$Collection.Provider, {
        scope: props.__scopeSlider
    }, /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$Collection.Slot, {
        scope: props.__scopeSlider
    }, /*#__PURE__*/ $inrcs$react.createElement(SliderOrientation, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        "aria-disabled": disabled,
        "data-disabled": disabled ? '' : undefined
    }, sliderProps, {
        ref: composedRefs,
        onPointerDown: $inrcs$radixuiprimitive.composeEventHandlers(sliderProps.onPointerDown, ()=>{
            if (!disabled) valuesBeforeSlideStartRef.current = values;
        }),
        min: min,
        max: max,
        inverted: inverted,
        onSlideStart: disabled ? undefined : handleSlideStart,
        onSlideMove: disabled ? undefined : handleSlideMove,
        onSlideEnd: disabled ? undefined : handleSlideEnd,
        onHomeKeyDown: ()=>!disabled && updateValues(min, 0, {
                commit: true
            })
        ,
        onEndKeyDown: ()=>!disabled && updateValues(max, values.length - 1, {
                commit: true
            })
        ,
        onStepKeyDown: ({ event: event , direction: stepDirection  })=>{
            if (!disabled) {
                const isPageKey = $1791bb30e2e418d5$var$PAGE_KEYS.includes(event.key);
                const isSkipKey = isPageKey || event.shiftKey && $1791bb30e2e418d5$var$ARROW_KEYS.includes(event.key);
                const multiplier = isSkipKey ? 10 : 1;
                const atIndex = valueIndexToChangeRef.current;
                const value = values[atIndex];
                const stepInDirection = step * multiplier * stepDirection;
                updateValues(value + stepInDirection, atIndex, {
                    commit: true
                });
            }
        }
    })))), isFormControl && values.map((value, index)=>/*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$BubbleInput, {
            key: index,
            name: name ? name + (values.length > 1 ? '[]' : '') : undefined,
            value: value
        })
    ));
});
/*#__PURE__*/ Object.assign($1791bb30e2e418d5$export$472062a354075cee, {
    displayName: $1791bb30e2e418d5$var$SLIDER_NAME
});
/* -------------------------------------------------------------------------------------------------
 * SliderHorizontal
 * -----------------------------------------------------------------------------------------------*/ const [$1791bb30e2e418d5$var$SliderOrientationProvider, $1791bb30e2e418d5$var$useSliderOrientationContext] = $1791bb30e2e418d5$var$createSliderContext($1791bb30e2e418d5$var$SLIDER_NAME, {
    startEdge: 'left',
    endEdge: 'right',
    size: 'width',
    direction: 1
});
const $1791bb30e2e418d5$var$SliderHorizontal = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { min: min , max: max , dir: dir , inverted: inverted , onSlideStart: onSlideStart , onSlideMove: onSlideMove , onSlideEnd: onSlideEnd , onStepKeyDown: onStepKeyDown , ...sliderProps } = props;
    const [slider, setSlider] = $inrcs$react.useState(null);
    const composedRefs = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setSlider(node)
    );
    const rectRef = $inrcs$react.useRef();
    const direction = $inrcs$radixuireactdirection.useDirection(dir);
    const isDirectionLTR = direction === 'ltr';
    const isSlidingFromLeft = isDirectionLTR && !inverted || !isDirectionLTR && inverted;
    function getValueFromPointer(pointerPosition) {
        const rect = rectRef.current || slider.getBoundingClientRect();
        const input = [
            0,
            rect.width
        ];
        const output = isSlidingFromLeft ? [
            min,
            max
        ] : [
            max,
            min
        ];
        const value = $1791bb30e2e418d5$var$linearScale(input, output);
        rectRef.current = rect;
        return value(pointerPosition - rect.left);
    }
    return /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderOrientationProvider, {
        scope: props.__scopeSlider,
        startEdge: isSlidingFromLeft ? 'left' : 'right',
        endEdge: isSlidingFromLeft ? 'right' : 'left',
        direction: isSlidingFromLeft ? 1 : -1,
        size: "width"
    }, /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderImpl, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        dir: direction,
        "data-orientation": "horizontal"
    }, sliderProps, {
        ref: composedRefs,
        style: {
            ...sliderProps.style,
            ['--radix-slider-thumb-transform']: 'translateX(-50%)'
        },
        onSlideStart: (event)=>{
            const value = getValueFromPointer(event.clientX);
            onSlideStart === null || onSlideStart === void 0 || onSlideStart(value);
        },
        onSlideMove: (event)=>{
            const value = getValueFromPointer(event.clientX);
            onSlideMove === null || onSlideMove === void 0 || onSlideMove(value);
        },
        onSlideEnd: ()=>{
            rectRef.current = undefined;
            onSlideEnd === null || onSlideEnd === void 0 || onSlideEnd();
        },
        onStepKeyDown: (event)=>{
            const slideDirection = isSlidingFromLeft ? 'from-left' : 'from-right';
            const isBackKey = $1791bb30e2e418d5$var$BACK_KEYS[slideDirection].includes(event.key);
            onStepKeyDown === null || onStepKeyDown === void 0 || onStepKeyDown({
                event: event,
                direction: isBackKey ? -1 : 1
            });
        }
    })));
});
/* -------------------------------------------------------------------------------------------------
 * SliderVertical
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$SliderVertical = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { min: min , max: max , inverted: inverted , onSlideStart: onSlideStart , onSlideMove: onSlideMove , onSlideEnd: onSlideEnd , onStepKeyDown: onStepKeyDown , ...sliderProps } = props;
    const sliderRef = $inrcs$react.useRef(null);
    const ref = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, sliderRef);
    const rectRef = $inrcs$react.useRef();
    const isSlidingFromBottom = !inverted;
    function getValueFromPointer(pointerPosition) {
        const rect = rectRef.current || sliderRef.current.getBoundingClientRect();
        const input = [
            0,
            rect.height
        ];
        const output = isSlidingFromBottom ? [
            max,
            min
        ] : [
            min,
            max
        ];
        const value = $1791bb30e2e418d5$var$linearScale(input, output);
        rectRef.current = rect;
        return value(pointerPosition - rect.top);
    }
    return /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderOrientationProvider, {
        scope: props.__scopeSlider,
        startEdge: isSlidingFromBottom ? 'bottom' : 'top',
        endEdge: isSlidingFromBottom ? 'top' : 'bottom',
        size: "height",
        direction: isSlidingFromBottom ? 1 : -1
    }, /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderImpl, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        "data-orientation": "vertical"
    }, sliderProps, {
        ref: ref,
        style: {
            ...sliderProps.style,
            ['--radix-slider-thumb-transform']: 'translateY(50%)'
        },
        onSlideStart: (event)=>{
            const value = getValueFromPointer(event.clientY);
            onSlideStart === null || onSlideStart === void 0 || onSlideStart(value);
        },
        onSlideMove: (event)=>{
            const value = getValueFromPointer(event.clientY);
            onSlideMove === null || onSlideMove === void 0 || onSlideMove(value);
        },
        onSlideEnd: ()=>{
            rectRef.current = undefined;
            onSlideEnd === null || onSlideEnd === void 0 || onSlideEnd();
        },
        onStepKeyDown: (event)=>{
            const slideDirection = isSlidingFromBottom ? 'from-bottom' : 'from-top';
            const isBackKey = $1791bb30e2e418d5$var$BACK_KEYS[slideDirection].includes(event.key);
            onStepKeyDown === null || onStepKeyDown === void 0 || onStepKeyDown({
                event: event,
                direction: isBackKey ? -1 : 1
            });
        }
    })));
});
/* -------------------------------------------------------------------------------------------------
 * SliderImpl
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$SliderImpl = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSlider: __scopeSlider , onSlideStart: onSlideStart , onSlideMove: onSlideMove , onSlideEnd: onSlideEnd , onHomeKeyDown: onHomeKeyDown , onEndKeyDown: onEndKeyDown , onStepKeyDown: onStepKeyDown , ...sliderProps } = props;
    const context = $1791bb30e2e418d5$var$useSliderContext($1791bb30e2e418d5$var$SLIDER_NAME, __scopeSlider);
    return /*#__PURE__*/ $inrcs$react.createElement($inrcs$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({}, sliderProps, {
        ref: forwardedRef,
        onKeyDown: $inrcs$radixuiprimitive.composeEventHandlers(props.onKeyDown, (event)=>{
            if (event.key === 'Home') {
                onHomeKeyDown(event); // Prevent scrolling to page start
                event.preventDefault();
            } else if (event.key === 'End') {
                onEndKeyDown(event); // Prevent scrolling to page end
                event.preventDefault();
            } else if ($1791bb30e2e418d5$var$PAGE_KEYS.concat($1791bb30e2e418d5$var$ARROW_KEYS).includes(event.key)) {
                onStepKeyDown(event); // Prevent scrolling for directional key presses
                event.preventDefault();
            }
        }),
        onPointerDown: $inrcs$radixuiprimitive.composeEventHandlers(props.onPointerDown, (event)=>{
            const target = event.target;
            target.setPointerCapture(event.pointerId); // Prevent browser focus behaviour because we focus a thumb manually when values change.
            event.preventDefault(); // Touch devices have a delay before focusing so won't focus if touch immediately moves
            // away from target (sliding). We want thumb to focus regardless.
            if (context.thumbs.has(target)) target.focus();
            else onSlideStart(event);
        }),
        onPointerMove: $inrcs$radixuiprimitive.composeEventHandlers(props.onPointerMove, (event)=>{
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) onSlideMove(event);
        }),
        onPointerUp: $inrcs$radixuiprimitive.composeEventHandlers(props.onPointerUp, (event)=>{
            const target = event.target;
            if (target.hasPointerCapture(event.pointerId)) {
                target.releasePointerCapture(event.pointerId);
                onSlideEnd(event);
            }
        })
    }));
});
/* -------------------------------------------------------------------------------------------------
 * SliderTrack
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$TRACK_NAME = 'SliderTrack';
const $1791bb30e2e418d5$export$105594979f116971 = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSlider: __scopeSlider , ...trackProps } = props;
    const context = $1791bb30e2e418d5$var$useSliderContext($1791bb30e2e418d5$var$TRACK_NAME, __scopeSlider);
    return /*#__PURE__*/ $inrcs$react.createElement($inrcs$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        "data-disabled": context.disabled ? '' : undefined,
        "data-orientation": context.orientation
    }, trackProps, {
        ref: forwardedRef
    }));
});
/*#__PURE__*/ Object.assign($1791bb30e2e418d5$export$105594979f116971, {
    displayName: $1791bb30e2e418d5$var$TRACK_NAME
});
/* -------------------------------------------------------------------------------------------------
 * SliderRange
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$RANGE_NAME = 'SliderRange';
const $1791bb30e2e418d5$export$a5cf38a7a000fe77 = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSlider: __scopeSlider , ...rangeProps } = props;
    const context = $1791bb30e2e418d5$var$useSliderContext($1791bb30e2e418d5$var$RANGE_NAME, __scopeSlider);
    const orientation = $1791bb30e2e418d5$var$useSliderOrientationContext($1791bb30e2e418d5$var$RANGE_NAME, __scopeSlider);
    const ref = $inrcs$react.useRef(null);
    const composedRefs = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
    const valuesCount = context.values.length;
    const percentages = context.values.map((value)=>$1791bb30e2e418d5$var$convertValueToPercentage(value, context.min, context.max)
    );
    const offsetStart = valuesCount > 1 ? Math.min(...percentages) : 0;
    const offsetEnd = 100 - Math.max(...percentages);
    return /*#__PURE__*/ $inrcs$react.createElement($inrcs$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        "data-orientation": context.orientation,
        "data-disabled": context.disabled ? '' : undefined
    }, rangeProps, {
        ref: composedRefs,
        style: {
            ...props.style,
            [orientation.startEdge]: offsetStart + '%',
            [orientation.endEdge]: offsetEnd + '%'
        }
    }));
});
/*#__PURE__*/ Object.assign($1791bb30e2e418d5$export$a5cf38a7a000fe77, {
    displayName: $1791bb30e2e418d5$var$RANGE_NAME
});
/* -------------------------------------------------------------------------------------------------
 * SliderThumb
 * -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$THUMB_NAME = 'SliderThumb';
const $1791bb30e2e418d5$export$2c1b491743890dec = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const getItems = $1791bb30e2e418d5$var$useCollection(props.__scopeSlider);
    const [thumb, setThumb] = $inrcs$react.useState(null);
    const composedRefs = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setThumb(node)
    );
    const index = $inrcs$react.useMemo(()=>thumb ? getItems().findIndex((item)=>item.ref.current === thumb
        ) : -1
    , [
        getItems,
        thumb
    ]);
    return /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$SliderThumbImpl, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({}, props, {
        ref: composedRefs,
        index: index
    }));
});
const $1791bb30e2e418d5$var$SliderThumbImpl = /*#__PURE__*/ $inrcs$react.forwardRef((props, forwardedRef)=>{
    const { __scopeSlider: __scopeSlider , index: index , ...thumbProps } = props;
    const context = $1791bb30e2e418d5$var$useSliderContext($1791bb30e2e418d5$var$THUMB_NAME, __scopeSlider);
    const orientation = $1791bb30e2e418d5$var$useSliderOrientationContext($1791bb30e2e418d5$var$THUMB_NAME, __scopeSlider);
    const [thumb, setThumb] = $inrcs$react.useState(null);
    const composedRefs = $inrcs$radixuireactcomposerefs.useComposedRefs(forwardedRef, (node)=>setThumb(node)
    );
    const size = $inrcs$radixuireactusesize.useSize(thumb); // We cast because index could be `-1` which would return undefined
    const value = context.values[index];
    const percent = value === undefined ? 0 : $1791bb30e2e418d5$var$convertValueToPercentage(value, context.min, context.max);
    const label = $1791bb30e2e418d5$var$getLabel(index, context.values.length);
    const orientationSize = size === null || size === void 0 ? void 0 : size[orientation.size];
    const thumbInBoundsOffset = orientationSize ? $1791bb30e2e418d5$var$getThumbInBoundsOffset(orientationSize, percent, orientation.direction) : 0;
    $inrcs$react.useEffect(()=>{
        if (thumb) {
            context.thumbs.add(thumb);
            return ()=>{
                context.thumbs.delete(thumb);
            };
        }
    }, [
        thumb,
        context.thumbs
    ]);
    return /*#__PURE__*/ $inrcs$react.createElement("span", {
        style: {
            transform: 'var(--radix-slider-thumb-transform)',
            position: 'absolute',
            [orientation.startEdge]: `calc(${percent}% + ${thumbInBoundsOffset}px)`
        }
    }, /*#__PURE__*/ $inrcs$react.createElement($1791bb30e2e418d5$var$Collection.ItemSlot, {
        scope: props.__scopeSlider
    }, /*#__PURE__*/ $inrcs$react.createElement($inrcs$radixuireactprimitive.Primitive.span, ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        role: "slider",
        "aria-label": props['aria-label'] || label,
        "aria-valuemin": context.min,
        "aria-valuenow": value,
        "aria-valuemax": context.max,
        "aria-orientation": context.orientation,
        "data-orientation": context.orientation,
        "data-disabled": context.disabled ? '' : undefined,
        tabIndex: context.disabled ? undefined : 0
    }, thumbProps, {
        ref: composedRefs,
        style: value === undefined ? {
            display: 'none'
        } : props.style,
        onFocus: $inrcs$radixuiprimitive.composeEventHandlers(props.onFocus, ()=>{
            context.valueIndexToChangeRef.current = index;
        })
    }))));
});
/*#__PURE__*/ Object.assign($1791bb30e2e418d5$export$2c1b491743890dec, {
    displayName: $1791bb30e2e418d5$var$THUMB_NAME
});
/* -----------------------------------------------------------------------------------------------*/ const $1791bb30e2e418d5$var$BubbleInput = (props)=>{
    const { value: value , ...inputProps } = props;
    const ref = $inrcs$react.useRef(null);
    const prevValue = $inrcs$radixuireactuseprevious.usePrevious(value); // Bubble value change to parents (e.g form change event)
    $inrcs$react.useEffect(()=>{
        const input = ref.current;
        const inputProto = window.HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(inputProto, 'value');
        const setValue = descriptor.set;
        if (prevValue !== value && setValue) {
            const event = new Event('input', {
                bubbles: true
            });
            setValue.call(input, value);
            input.dispatchEvent(event);
        }
    }, [
        prevValue,
        value
    ]);
    /**
   * We purposefully do not use `type="hidden"` here otherwise forms that
   * wrap it will not be able to access its value via the FormData API.
   *
   * We purposefully do not add the `value` attribute here to allow the value
   * to be set programatically and bubble to any parent form `onChange` event.
   * Adding the `value` will cause React to consider the programatic
   * dispatch a duplicate and it will get swallowed.
   */ return /*#__PURE__*/ $inrcs$react.createElement("input", ($parcel$interopDefault($inrcs$babelruntimehelpersextends))({
        style: {
            display: 'none'
        }
    }, inputProps, {
        ref: ref,
        defaultValue: value
    }));
};
function $1791bb30e2e418d5$var$getNextSortedValues(prevValues = [], nextValue, atIndex) {
    const nextValues = [
        ...prevValues
    ];
    nextValues[atIndex] = nextValue;
    return nextValues.sort((a, b)=>a - b
    );
}
function $1791bb30e2e418d5$var$convertValueToPercentage(value, min, max) {
    const maxSteps = max - min;
    const percentPerStep = 100 / maxSteps;
    const percentage = percentPerStep * (value - min);
    return $inrcs$radixuinumber.clamp(percentage, [
        0,
        100
    ]);
}
/**
 * Returns a label for each thumb when there are two or more thumbs
 */ function $1791bb30e2e418d5$var$getLabel(index, totalValues) {
    if (totalValues > 2) return `Value ${index + 1} of ${totalValues}`;
    else if (totalValues === 2) return [
        'Minimum',
        'Maximum'
    ][index];
    else return undefined;
}
/**
 * Given a `values` array and a `nextValue`, determine which value in
 * the array is closest to `nextValue` and return its index.
 *
 * @example
 * // returns 1
 * getClosestValueIndex([10, 30], 25);
 */ function $1791bb30e2e418d5$var$getClosestValueIndex(values, nextValue) {
    if (values.length === 1) return 0;
    const distances = values.map((value)=>Math.abs(value - nextValue)
    );
    const closestDistance = Math.min(...distances);
    return distances.indexOf(closestDistance);
}
/**
 * Offsets the thumb centre point while sliding to ensure it remains
 * within the bounds of the slider when reaching the edges
 */ function $1791bb30e2e418d5$var$getThumbInBoundsOffset(width, left, direction) {
    const halfWidth = width / 2;
    const halfPercent = 50;
    const offset = $1791bb30e2e418d5$var$linearScale([
        0,
        halfPercent
    ], [
        0,
        halfWidth
    ]);
    return (halfWidth - offset(left) * direction) * direction;
}
/**
 * Gets an array of steps between each value.
 *
 * @example
 * // returns [1, 9]
 * getStepsBetweenValues([10, 11, 20]);
 */ function $1791bb30e2e418d5$var$getStepsBetweenValues(values) {
    return values.slice(0, -1).map((value, index)=>values[index + 1] - value
    );
}
/**
 * Verifies the minimum steps between all values is greater than or equal
 * to the expected minimum steps.
 *
 * @example
 * // returns false
 * hasMinStepsBetweenValues([1,2,3], 2);
 *
 * @example
 * // returns true
 * hasMinStepsBetweenValues([1,2,3], 1);
 */ function $1791bb30e2e418d5$var$hasMinStepsBetweenValues(values, minStepsBetweenValues) {
    if (minStepsBetweenValues > 0) {
        const stepsBetweenValues = $1791bb30e2e418d5$var$getStepsBetweenValues(values);
        const actualMinStepsBetweenValues = Math.min(...stepsBetweenValues);
        return actualMinStepsBetweenValues >= minStepsBetweenValues;
    }
    return true;
} // https://github.com/tmcw-up-for-adoption/simple-linear-scale/blob/master/index.js
function $1791bb30e2e418d5$var$linearScale(input, output) {
    return (value)=>{
        if (input[0] === input[1] || output[0] === output[1]) return output[0];
        const ratio = (output[1] - output[0]) / (input[1] - input[0]);
        return output[0] + ratio * (value - input[0]);
    };
}
function $1791bb30e2e418d5$var$getDecimalCount(value) {
    return (String(value).split('.')[1] || '').length;
}
function $1791bb30e2e418d5$var$roundValue(value, decimalCount) {
    const rounder = Math.pow(10, decimalCount);
    return Math.round(value * rounder) / rounder;
}
const $1791bb30e2e418d5$export$be92b6f5f03c0fe9 = $1791bb30e2e418d5$export$472062a354075cee;
const $1791bb30e2e418d5$export$13921ac0cc260818 = $1791bb30e2e418d5$export$105594979f116971;
const $1791bb30e2e418d5$export$9a58ef0d7ad3278c = $1791bb30e2e418d5$export$a5cf38a7a000fe77;
const $1791bb30e2e418d5$export$6521433ed15a34db = $1791bb30e2e418d5$export$2c1b491743890dec;




//# sourceMappingURL=index.js.map
