var $hnlpS$react = require("react");
var $hnlpS$radixuireactcontext = require("@radix-ui/react-context");
var $hnlpS$radixuireactcomposerefs = require("@radix-ui/react-compose-refs");
var $hnlpS$radixuireactslot = require("@radix-ui/react-slot");

function $parcel$export(e, n, v, s) {
  Object.defineProperty(e, n, {get: v, set: s, enumerable: true, configurable: true});
}
function $parcel$interopDefault(a) {
  return a && a.__esModule ? a.default : a;
}

$parcel$export(module.exports, "createCollection", () => $1a96635ec239608b$export$c74125a8e3af6bb2);




// We have resorted to returning slots directly rather than exposing primitives that can then
// be slotted like `<CollectionItem as={Slot}>…</CollectionItem>`.
// This is because we encountered issues with generic types that cannot be statically analysed
// due to creating them dynamically via createCollection.
function $1a96635ec239608b$export$c74125a8e3af6bb2(name) {
    /* -----------------------------------------------------------------------------------------------
   * CollectionProvider
   * ---------------------------------------------------------------------------------------------*/ const PROVIDER_NAME = name + 'CollectionProvider';
    const [createCollectionContext, createCollectionScope] = $hnlpS$radixuireactcontext.createContextScope(PROVIDER_NAME);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(PROVIDER_NAME, {
        collectionRef: {
            current: null
        },
        itemMap: new Map()
    });
    const CollectionProvider = (props)=>{
        const { scope: scope , children: children  } = props;
        const ref = ($parcel$interopDefault($hnlpS$react)).useRef(null);
        const itemMap = ($parcel$interopDefault($hnlpS$react)).useRef(new Map()).current;
        return /*#__PURE__*/ ($parcel$interopDefault($hnlpS$react)).createElement(CollectionProviderImpl, {
            scope: scope,
            itemMap: itemMap,
            collectionRef: ref
        }, children);
    };
    /*#__PURE__*/ Object.assign(CollectionProvider, {
        displayName: PROVIDER_NAME
    });
    /* -----------------------------------------------------------------------------------------------
   * CollectionSlot
   * ---------------------------------------------------------------------------------------------*/ const COLLECTION_SLOT_NAME = name + 'CollectionSlot';
    const CollectionSlot = /*#__PURE__*/ ($parcel$interopDefault($hnlpS$react)).forwardRef((props, forwardedRef)=>{
        const { scope: scope , children: children  } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = $hnlpS$radixuireactcomposerefs.useComposedRefs(forwardedRef, context.collectionRef);
        return /*#__PURE__*/ ($parcel$interopDefault($hnlpS$react)).createElement($hnlpS$radixuireactslot.Slot, {
            ref: composedRefs
        }, children);
    });
    /*#__PURE__*/ Object.assign(CollectionSlot, {
        displayName: COLLECTION_SLOT_NAME
    });
    /* -----------------------------------------------------------------------------------------------
   * CollectionItem
   * ---------------------------------------------------------------------------------------------*/ const ITEM_SLOT_NAME = name + 'CollectionItemSlot';
    const ITEM_DATA_ATTR = 'data-radix-collection-item';
    const CollectionItemSlot = /*#__PURE__*/ ($parcel$interopDefault($hnlpS$react)).forwardRef((props, forwardedRef)=>{
        const { scope: scope , children: children , ...itemData } = props;
        const ref = ($parcel$interopDefault($hnlpS$react)).useRef(null);
        const composedRefs = $hnlpS$radixuireactcomposerefs.useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        ($parcel$interopDefault($hnlpS$react)).useEffect(()=>{
            context.itemMap.set(ref, {
                ref: ref,
                ...itemData
            });
            return ()=>void context.itemMap.delete(ref)
            ;
        });
        return /*#__PURE__*/ ($parcel$interopDefault($hnlpS$react)).createElement($hnlpS$radixuireactslot.Slot, {
            [ITEM_DATA_ATTR]: '',
            ref: composedRefs
        }, children);
    });
    /*#__PURE__*/ Object.assign(CollectionItemSlot, {
        displayName: ITEM_SLOT_NAME
    });
    /* -----------------------------------------------------------------------------------------------
   * useCollection
   * ---------------------------------------------------------------------------------------------*/ function useCollection(scope) {
        const context = useCollectionContext(name + 'CollectionConsumer', scope);
        const getItems = ($parcel$interopDefault($hnlpS$react)).useCallback(()=>{
            const collectionNode = context.collectionRef.current;
            if (!collectionNode) return [];
            const orderedNodes = Array.from(collectionNode.querySelectorAll(`[${ITEM_DATA_ATTR}]`));
            const items = Array.from(context.itemMap.values());
            const orderedItems = items.sort((a, b)=>orderedNodes.indexOf(a.ref.current) - orderedNodes.indexOf(b.ref.current)
            );
            return orderedItems;
        }, [
            context.collectionRef,
            context.itemMap
        ]);
        return getItems;
    }
    return [
        {
            Provider: CollectionProvider,
            Slot: CollectionSlot,
            ItemSlot: CollectionItemSlot
        },
        useCollection,
        createCollectionScope
    ];
}




//# sourceMappingURL=index.js.map
