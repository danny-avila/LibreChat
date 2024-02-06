import $6vYhU$react from "react";
import {createContextScope as $6vYhU$createContextScope} from "@radix-ui/react-context";
import {useComposedRefs as $6vYhU$useComposedRefs} from "@radix-ui/react-compose-refs";
import {Slot as $6vYhU$Slot} from "@radix-ui/react-slot";





// We have resorted to returning slots directly rather than exposing primitives that can then
// be slotted like `<CollectionItem as={Slot}>…</CollectionItem>`.
// This is because we encountered issues with generic types that cannot be statically analysed
// due to creating them dynamically via createCollection.
function $e02a7d9cb1dc128c$export$c74125a8e3af6bb2(name) {
    /* -----------------------------------------------------------------------------------------------
   * CollectionProvider
   * ---------------------------------------------------------------------------------------------*/ const PROVIDER_NAME = name + 'CollectionProvider';
    const [createCollectionContext, createCollectionScope] = $6vYhU$createContextScope(PROVIDER_NAME);
    const [CollectionProviderImpl, useCollectionContext] = createCollectionContext(PROVIDER_NAME, {
        collectionRef: {
            current: null
        },
        itemMap: new Map()
    });
    const CollectionProvider = (props)=>{
        const { scope: scope , children: children  } = props;
        const ref = $6vYhU$react.useRef(null);
        const itemMap = $6vYhU$react.useRef(new Map()).current;
        return /*#__PURE__*/ $6vYhU$react.createElement(CollectionProviderImpl, {
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
    const CollectionSlot = /*#__PURE__*/ $6vYhU$react.forwardRef((props, forwardedRef)=>{
        const { scope: scope , children: children  } = props;
        const context = useCollectionContext(COLLECTION_SLOT_NAME, scope);
        const composedRefs = $6vYhU$useComposedRefs(forwardedRef, context.collectionRef);
        return /*#__PURE__*/ $6vYhU$react.createElement($6vYhU$Slot, {
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
    const CollectionItemSlot = /*#__PURE__*/ $6vYhU$react.forwardRef((props, forwardedRef)=>{
        const { scope: scope , children: children , ...itemData } = props;
        const ref = $6vYhU$react.useRef(null);
        const composedRefs = $6vYhU$useComposedRefs(forwardedRef, ref);
        const context = useCollectionContext(ITEM_SLOT_NAME, scope);
        $6vYhU$react.useEffect(()=>{
            context.itemMap.set(ref, {
                ref: ref,
                ...itemData
            });
            return ()=>void context.itemMap.delete(ref)
            ;
        });
        return /*#__PURE__*/ $6vYhU$react.createElement($6vYhU$Slot, {
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
        const getItems = $6vYhU$react.useCallback(()=>{
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




export {$e02a7d9cb1dc128c$export$c74125a8e3af6bb2 as createCollection};
//# sourceMappingURL=index.mjs.map
