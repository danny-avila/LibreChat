import { ForwardRefExoticComponent, RefAttributes } from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';

const Collapsible: ForwardRefExoticComponent<
  CollapsiblePrimitive.CollapsibleProps & RefAttributes<HTMLDivElement>
> = CollapsiblePrimitive.Root;

const CollapsibleTrigger: ForwardRefExoticComponent<
  CollapsiblePrimitive.CollapsibleTriggerProps & RefAttributes<HTMLButtonElement>
> = CollapsiblePrimitive.CollapsibleTrigger;

const CollapsibleContent: ForwardRefExoticComponent<
  CollapsiblePrimitive.CollapsibleContentProps & RefAttributes<HTMLDivElement>
> = CollapsiblePrimitive.CollapsibleContent;

export { Collapsible, CollapsibleTrigger, CollapsibleContent };
